use dep::std::hash::poseidon2::Poseidon2;

// Two entry points compiled as a single binary.
// The frontend selects which to call by the input shape.

// commitment = Poseidon2([secret], 1)
// Used in registration and for finding the leaf index at claim time.
fn main(secret: Field) -> pub Field {
    Poseidon2::hash([secret], 1)
}
