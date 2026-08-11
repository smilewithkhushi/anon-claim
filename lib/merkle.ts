import { keccak256, toBytes, toHex, concat, pad } from 'viem'

export const TREE_DEPTH = 20
const ZERO_VALUE = '0x0000000000000000000000000000000000000000000000000000000000000000' as const

// Precomputed zero hashes for each level (bottom-up)
const ZERO_HASHES: `0x${string}`[] = (() => {
  const z: `0x${string}`[] = [ZERO_VALUE]
  for (let i = 1; i <= TREE_DEPTH; i++) {
    z.push(hashPair(z[i - 1], z[i - 1]))
  }
  return z
})()

function hashPair(left: `0x${string}`, right: `0x${string}`): `0x${string}` {
  const combined = concat([pad(toBytes(left), { size: 32 }), pad(toBytes(right), { size: 32 })])
  return keccak256(combined)
}

export interface MerkleTree {
  leaves: `0x${string}`[]
  root: `0x${string}`
}

export interface MerklePath {
  siblings: `0x${string}`[]   // sibling hashes from leaf to root
  pathIndices: number[]        // 0 = leaf is left child, 1 = leaf is right child
}

export function buildTree(leaves: `0x${string}`[]): MerkleTree {
  const capacity = 1 << TREE_DEPTH
  if (leaves.length > capacity) throw new Error('Too many leaves for tree depth')

  // Pad to next power of 2 at current level
  const nodes: `0x${string}`[] = [...leaves]
  for (let i = leaves.length; i < capacity; i++) {
    nodes.push(ZERO_VALUE)
  }

  let level = [...nodes]
  for (let d = 0; d < TREE_DEPTH; d++) {
    const next: `0x${string}`[] = []
    for (let i = 0; i < level.length; i += 2) {
      next.push(hashPair(level[i], level[i + 1]))
    }
    level = next
  }

  return { leaves, root: level[0] }
}

export function getMerklePath(leaves: `0x${string}`[], leafIndex: number): MerklePath {
  const capacity = 1 << TREE_DEPTH
  const nodes: `0x${string}`[] = [...leaves]
  for (let i = leaves.length; i < capacity; i++) {
    nodes.push(ZERO_VALUE)
  }

  const siblings: `0x${string}`[] = []
  const pathIndices: number[] = []

  let level = [...nodes]
  let idx = leafIndex

  for (let d = 0; d < TREE_DEPTH; d++) {
    const siblingIdx = idx % 2 === 0 ? idx + 1 : idx - 1
    siblings.push(level[siblingIdx] ?? ZERO_HASHES[d])
    pathIndices.push(idx % 2)
    const next: `0x${string}`[] = []
    for (let i = 0; i < level.length; i += 2) {
      next.push(hashPair(level[i], level[i + 1]))
    }
    level = next
    idx = Math.floor(idx / 2)
  }

  return { siblings, pathIndices }
}

export function getRoot(leaves: `0x${string}`[]): `0x${string}` {
  return buildTree(leaves).root
}
