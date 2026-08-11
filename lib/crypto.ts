'use client'

import { keccak256, toBytes, toHex } from 'viem'

// Fr field modulus for BN254 (Noir's native field)
const BN254_FR =
  BigInt('0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001')

// 31 bytes = 248 bits, always less than BN254 Fr, no reduction needed
export function generateSecret(): `0x${string}` {
  const bytes = crypto.getRandomValues(new Uint8Array(31))
  return toHex(bytes)
}

export function secretToBigInt(secret: `0x${string}`): bigint {
  const n = BigInt(secret)
  if (n >= BN254_FR) throw new Error('Secret out of BN254 Fr range')
  return n
}

// TODO: replace with Poseidon2 once circuit is compiled and field constants confirmed.
// commitment = keccak256(secret) truncated to 31 bytes so it fits in Fr.
export function deriveCommitment(secret: `0x${string}`): `0x${string}` {
  const hash = keccak256(toBytes(secret))
  // Mask top byte to ensure result < BN254 Fr
  const bytes = toBytes(hash)
  bytes[0] = bytes[0] & 0x1f
  return toHex(bytes)
}

// nullifier = keccak256(secret ++ scope) truncated to fit Fr
// TODO: replace with Poseidon2(secret, scope) matching the circuit
export function deriveNullifier(
  secret: `0x${string}`,
  scope: `0x${string}`
): `0x${string}` {
  const combined = toBytes(secret + scope.slice(2))
  const hash = keccak256(combined)
  const bytes = toBytes(hash)
  bytes[0] = bytes[0] & 0x1f
  return toHex(bytes)
}
