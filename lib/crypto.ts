'use client'

// Crypto utilities for the anon-claim frontend.
// All hashing uses Poseidon2 via Noir.execute() so it exactly matches
// the anon_claim circuit's internal computation.

import { Noir } from '@noir-lang/noir_js'
import type { CompiledCircuit } from '@noir-lang/types'
import commitmentCircuit from '@/circuit-utils/target/hasher.json'
import pairCircuit from '@/circuit-utils/target/pair_hasher.json'

// Fr field modulus for BN254
const BN254_FR = BigInt(
  '0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001'
)

// Singleton Noir instances — init() runs once per instance lifecycle
let _commitmentNoir: Noir | null = null
let _pairNoir: Noir | null = null

function commitmentNoir(): Noir {
  if (!_commitmentNoir) _commitmentNoir = new Noir(commitmentCircuit as unknown as CompiledCircuit)
  return _commitmentNoir
}

export function pairNoir(): Noir {
  if (!_pairNoir) _pairNoir = new Noir(pairCircuit as unknown as CompiledCircuit)
  return _pairNoir
}

// 31 bytes = 248 bits, always fits in BN254 Fr without reduction
export function generateSecret(): `0x${string}` {
  const bytes = crypto.getRandomValues(new Uint8Array(31))
  return ('0x' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')) as `0x${string}`
}

export function secretToBigInt(secret: `0x${string}`): bigint {
  const n = BigInt(secret)
  if (n >= BN254_FR) throw new Error('Secret out of BN254 Fr range')
  return n
}

// commitment = Poseidon2([secret], 1)
// This matches: Poseidon2::hash([secret], 1) in circuit/src/main.nr
export async function deriveCommitment(secret: `0x${string}`): Promise<`0x${string}`> {
  const { returnValue } = await commitmentNoir().execute({ secret })
  return returnValue as `0x${string}`
}

// nullifier = Poseidon2([secret, scope], 2)
// This matches: Poseidon2::hash([secret, scope], 2) in circuit/src/main.nr
export async function deriveNullifier(
  secret: `0x${string}`,
  scope: `0x${string}`
): Promise<`0x${string}`> {
  // Re-use the pair circuit with (secret, scope) as inputs
  const { returnValue } = await pairNoir().execute({ left: secret, right: scope })
  return returnValue as `0x${string}`
}
