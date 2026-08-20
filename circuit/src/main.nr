// 2^64: IV = message_size * TWO64 in the Poseidon2 sponge capacity slot
global TWO64: Field = 18446744073709551616;

// Depth must match TREE_DEPTH in lib/merkle.ts
global DEPTH: u32 = 20;

// hash([input], 1) using the public poseidon2_permutation builtin.
// Equivalent to the private Poseidon2::hash([input], 1) from std::hash::poseidon2.
fn p2_hash_1(input: Field) -> Field {
    std::hash::poseidon2_permutation([input, 0, 0, TWO64], 4)[0]
}

// hash([a, b], 2): used for Merkle nodes and nullifiers.
fn p2_hash_2(a: Field, b: Field) -> Field {
    std::hash::poseidon2_permutation([a, b, 0, TWO64 * 2], 4)[0]
}

// Hash two field elements into one Merkle node using Poseidon2.
fn merkle_hash(left: Field, right: Field) -> Field {
    p2_hash_2(left, right)
}

// Recompute the Merkle root from a leaf and its authentication path.
//   path_indices[i] = 0  =>  current node is the LEFT child at depth i
//   path_indices[i] = 1  =>  current node is the RIGHT child at depth i
fn compute_merkle_root(
    leaf: Field,
    path_indices: [u1; DEPTH],
    siblings: [Field; DEPTH],
) -> Field {
    let mut current = leaf;
    for i in 0..DEPTH {
        let is_right = path_indices[i] == 1;
        let (left, right) = if is_right {
            (siblings[i], current)
        } else {
            (current, siblings[i])
        };
        current = merkle_hash(left, right);
    }
    current
}

// Circuit entry point
//
// Private inputs (known only to the prover):
//   secret       - identity secret generated at registration
//   path_indices - Merkle path direction bits (0=left, 1=right)
//   siblings     - sibling hashes along the Merkle authentication path
//
// Public inputs (verified by the smart contract):
//   root         - current Merkle root of the eligibility set
//   nullifier    - Poseidon2(secret, scope); prevents double-claiming
//   scope        - campaign-specific constant: Hash(contract_address || campaign_id)
//   recipient    - reward recipient address; bound here to prevent front-running
//
// What this proves:
//   1. The prover knows a secret whose commitment (Poseidon2(secret)) is a leaf
//      in the Merkle tree at the supplied root.
//   2. The nullifier is correctly derived from that secret and the campaign scope,
//      uniquely identifying this claim without revealing which leaf it came from.
//   3. The recipient address is bound into the proof body -- altering it after
//      the fact would cause the verifier to reject the proof.
fn main(
    // private
    secret: Field,
    path_indices: [u1; DEPTH],
    siblings: [Field; DEPTH],
    // public
    root: pub Field,
    nullifier: pub Field,
    scope: pub Field,
    recipient: pub Field,
) {
    // 1. commitment = Poseidon2(secret)
    let commitment = p2_hash_1(secret);

    // 2. Prove commitment is a leaf in the eligibility tree
    let computed_root = compute_merkle_root(commitment, path_indices, siblings);
    assert(computed_root == root, "Commitment not in eligibility tree");

    // 3. Verify nullifier = Poseidon2(secret, scope)
    //    scope is campaign-specific, so nullifiers from different campaigns
    //    cannot be replayed against each other
    let computed_nullifier = p2_hash_2(secret, scope);
    assert(computed_nullifier == nullifier, "Invalid nullifier");

    // 4. Sanity check: recipient must be non-zero
    //    The binding is already enforced by recipient being a public input --
    //    any modification would make the verifier reject the proof.
    assert(recipient != 0, "Recipient must be non-zero");
}

// Tests

#[test]
fn test_commitment_deterministic() {
    let secret: Field = 0x123456789abcdef;
    let c1 = p2_hash_1(secret);
    let c2 = p2_hash_1(secret);
    assert(c1 == c2);
    assert(c1 != 0);
    assert(c1 != secret);
}

#[test]
fn test_nullifier_scope_isolation() {
    let secret: Field = 0x123456789abcdef;
    let scope1: Field = 0xdeadbeef;
    let scope2: Field = 0xcafebabe;
    let n1 = p2_hash_2(secret, scope1);
    let n2 = p2_hash_2(secret, scope2);
    assert(n1 != n2);
}

#[test]
fn test_merkle_hash_order_matters() {
    let a: Field = 0x111;
    let b: Field = 0x222;
    assert(merkle_hash(a, b) != merkle_hash(b, a));
}
