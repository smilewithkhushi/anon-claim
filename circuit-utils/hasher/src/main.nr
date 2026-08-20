// 2^64: IV = message_size * TWO64 in the Poseidon2 sponge capacity slot
global TWO64: Field = 18446744073709551616;

// commitment = Poseidon2([secret], 1)
// Used in registration and for finding the leaf index at claim time.
fn main(secret: Field) -> pub Field {
    std::hash::poseidon2_permutation([secret, 0, 0, TWO64], 4)[0]
}
