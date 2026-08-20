// 2^64: IV = message_size * TWO64 in the Poseidon2 sponge capacity slot
global TWO64: Field = 18446744073709551616;

// Merkle node hash: Poseidon2([left, right], 2)
// Must match merkle_hash() in circuit/src/main.nr exactly.
fn main(left: Field, right: Field) -> pub Field {
    std::hash::poseidon2_permutation([left, right, 0, TWO64 * 2], 4)[0]
}
