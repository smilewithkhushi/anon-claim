// Incremental binary Merkle tree using Poseidon2 (matching the circuit).
// All hash calls go through Noir.execute() so the tree is guaranteed to match
// what the anon_claim circuit recomputes during verification.

import { Noir } from '@noir-lang/noir_js'
import type { CompiledCircuit } from '@noir-lang/types'
import pairCircuit from '@/circuit-utils/target/pair_hasher.json'

export const TREE_DEPTH = 20

const ZERO_VALUE = '0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`

let _pairNoir: Noir | null = null
function getPairNoir(): Noir {
  if (!_pairNoir) _pairNoir = new Noir(pairCircuit as unknown as CompiledCircuit)
  return _pairNoir
}

// Hash two siblings using Poseidon2([left, right], 2)
// Matches merkle_hash() in circuit/src/main.nr
export async function merkleHash(left: `0x${string}`, right: `0x${string}`): Promise<`0x${string}`> {
  const { returnValue } = await getPairNoir().execute({ left, right })
  return returnValue as `0x${string}`
}

// Precomputed zero hashes for each level bottom-up.
// Computed once lazily; awaited on first use.
let _zeroHashesPromise: Promise<`0x${string}`[]> | null = null

async function getZeroHashes(): Promise<`0x${string}`[]> {
  if (_zeroHashesPromise) return _zeroHashesPromise
  _zeroHashesPromise = (async () => {
    const z: `0x${string}`[] = [ZERO_VALUE]
    for (let i = 1; i <= TREE_DEPTH; i++) {
      z.push(await merkleHash(z[i - 1], z[i - 1]))
    }
    return z
  })()
  return _zeroHashesPromise
}

export interface MerklePath {
  siblings: `0x${string}`[]
  pathIndices: number[]
}

// Build a sparse Merkle tree root from the given leaves.
// Leaves not in the list are treated as ZERO_VALUE.
// Uses an incremental approach: only computes hashes for non-zero nodes.
export async function getRoot(leaves: `0x${string}`[]): Promise<`0x${string}`> {
  const zeroHashes = await getZeroHashes()

  // Map from (level, index) -> hash for non-zero nodes
  const nodes: Map<string, `0x${string}`> = new Map()
  leaves.forEach((leaf, i) => {
    if (leaf !== ZERO_VALUE) nodes.set(`0,${i}`, leaf)
  })

  for (let d = 0; d < TREE_DEPTH; d++) {
    // Collect all indices that have non-zero nodes at this level
    const indices = new Set<number>()
    for (const key of nodes.keys()) {
      const [level, idx] = key.split(',')
      if (Number(level) === d) indices.add(Number(idx))
    }

    const parents = new Set<number>()
    for (const idx of indices) {
      parents.add(Math.floor(idx / 2))
    }

    for (const parentIdx of parents) {
      const leftIdx = parentIdx * 2
      const rightIdx = parentIdx * 2 + 1
      const left = nodes.get(`${d},${leftIdx}`) ?? zeroHashes[d]
      const right = nodes.get(`${d},${rightIdx}`) ?? zeroHashes[d]
      nodes.set(`${d + 1},${parentIdx}`, await merkleHash(left, right))
    }
  }

  return nodes.get(`${TREE_DEPTH},0`) ?? zeroHashes[TREE_DEPTH]
}

// Compute the Merkle authentication path for the leaf at leafIndex.
// Returns siblings and path indices ready to pass to the anon_claim circuit.
export async function getMerklePath(
  leaves: `0x${string}`[],
  leafIndex: number
): Promise<MerklePath> {
  const zeroHashes = await getZeroHashes()

  // Build full node map (sparse)
  const nodes: Map<string, `0x${string}`> = new Map()
  leaves.forEach((leaf, i) => {
    if (leaf !== ZERO_VALUE) nodes.set(`0,${i}`, leaf)
  })

  // Recompute non-zero nodes bottom-up
  for (let d = 0; d < TREE_DEPTH; d++) {
    const indices = new Set<number>()
    for (const key of nodes.keys()) {
      const [level, idx] = key.split(',')
      if (Number(level) === d) indices.add(Number(idx))
    }
    const parents = new Set<number>()
    for (const idx of indices) parents.add(Math.floor(idx / 2))

    for (const parentIdx of parents) {
      const l = nodes.get(`${d},${parentIdx * 2}`) ?? zeroHashes[d]
      const r = nodes.get(`${d},${parentIdx * 2 + 1}`) ?? zeroHashes[d]
      nodes.set(`${d + 1},${parentIdx}`, await merkleHash(l, r))
    }
  }

  // Extract path
  const siblings: `0x${string}`[] = []
  const pathIndices: number[] = []
  let idx = leafIndex
  for (let d = 0; d < TREE_DEPTH; d++) {
    const siblingIdx = idx % 2 === 0 ? idx + 1 : idx - 1
    siblings.push(nodes.get(`${d},${siblingIdx}`) ?? zeroHashes[d])
    pathIndices.push(idx % 2)
    idx = Math.floor(idx / 2)
  }

  return { siblings, pathIndices }
}
