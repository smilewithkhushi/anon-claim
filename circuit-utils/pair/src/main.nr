use dep::std::hash::poseidon2::Poseidon2;

// Merkle node hash: Poseidon2([left, right], 2)
// Must match merkle_hash() in circuit/src/main.nr exactly.
fn main(left: Field, right: Field) -> pub Field {
    Poseidon2::hash([left, right], 2)
}
