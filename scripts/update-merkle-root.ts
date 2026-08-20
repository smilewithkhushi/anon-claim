#!/usr/bin/env npx tsx
/**
 * Computes the Poseidon2 Merkle root from self/commitments.json and updates
 * the on-chain merkleRoot via setMerkleRoot().
 *
 * Usage:
 *   pnpm update-root          (reads PRIVATE_KEY from .env)
 *   PRIVATE_KEY=0x... pnpm update-root
 *
 * Without PRIVATE_KEY: prints the cast command instead of sending.
 */
process.loadEnvFile('.env')
import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'
import { Noir } from '@noir-lang/noir_js'
import type { CompiledCircuit } from '@noir-lang/types'

const ROOT = process.cwd()

const pairCircuit: CompiledCircuit = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'circuit-utils/target/pair_hasher.json'), 'utf8')
)

const CONTRACT = process.env.NEXT_PUBLIC_CLAIM_CONTRACT ?? '0x7BF490F5f28A1eE44C00C21A95c6a10d5722Ca40'
const RPC      = process.env.NEXT_PUBLIC_HORIZEN_RPC_URL ?? 'https://horizen-testnet.rpc.caldera.xyz/http'

// ---------------------------------------------------------------------------
// Poseidon2 Merkle tree — mirrors lib/merkle.ts exactly
// ---------------------------------------------------------------------------

const TREE_DEPTH = 20
const ZERO = '0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`

let _noir: Noir | null = null
function noir(): Noir {
  if (!_noir) _noir = new Noir(pairCircuit)
  return _noir
}

async function merkleHash(left: `0x${string}`, right: `0x${string}`): Promise<`0x${string}`> {
  const { returnValue } = await noir().execute({ left, right })
  return returnValue as `0x${string}`
}

async function buildZeroHashes(): Promise<`0x${string}`[]> {
  const z: `0x${string}`[] = [ZERO]
  for (let i = 1; i <= TREE_DEPTH; i++) z.push(await merkleHash(z[i - 1], z[i - 1]))
  return z
}

async function getRoot(leaves: `0x${string}`[]): Promise<`0x${string}`> {
  const zeros = await buildZeroHashes()
  const nodes = new Map<string, `0x${string}`>()
  leaves.forEach((leaf, i) => { if (leaf !== ZERO) nodes.set(`0,${i}`, leaf) })

  for (let d = 0; d < TREE_DEPTH; d++) {
    const parents = new Set<number>()
    for (const key of nodes.keys()) {
      const [lvl, idx] = key.split(',').map(Number)
      if (lvl === d) parents.add(Math.floor(idx / 2))
    }
    for (const p of parents) {
      const l = nodes.get(`${d},${p * 2}`) ?? zeros[d]
      const r = nodes.get(`${d},${p * 2 + 1}`) ?? zeros[d]
      nodes.set(`${d + 1},${p}`, await merkleHash(l, r))
    }
  }
  return nodes.get(`${TREE_DEPTH},0`) ?? zeros[TREE_DEPTH]
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const commitments: `0x${string}`[] = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'self/commitments.json'), 'utf8')
  )

  console.log(`Computing Merkle root for ${commitments.length} commitment(s)…`)
  const root = await getRoot(commitments)
  console.log(`Root: ${root}`)

  const privateKey = process.env.PRIVATE_KEY
  if (privateKey) {
    console.log('Sending setMerkleRoot transaction…')
    const cmd = [
      'cast send',
      CONTRACT,
      '"setMerkleRoot(bytes32)"',
      root,
      `--rpc-url ${RPC}`,
      `--private-key ${privateKey}`,
    ].join(' ')
    const out = execSync(cmd, { encoding: 'utf8' })
    console.log(out)
  } else {
    console.log('\nNo PRIVATE_KEY set. Run this to update on-chain:')
    console.log(
      `\ncast send ${CONTRACT} "setMerkleRoot(bytes32)" ${root} \\\n` +
      `  --rpc-url ${RPC} \\\n` +
      `  --private-key $PRIVATE_KEY`
    )
  }
}

main().catch(err => { console.error(err); process.exit(1) })
