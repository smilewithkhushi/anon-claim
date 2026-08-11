// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// @title IZkVerify
/// @notice Interface for Horizen's zkVerify attestation verifier deployed on Horizen EVM.
///
/// The zkVerify chain aggregates proofs into batches and publishes a Merkle attestation
/// root to the destination chain. This interface lets the claim contract confirm that a
/// specific proof leaf is included in a published attestation.
///
/// TODO: Verify this interface against the actual deployed contract ABI on Horizen testnet
///       before going to production. The contract address should be set via ZKVERIFY_CONTRACT
///       in your deployment environment.
interface IZkVerify {
    /// @notice Verify that a proof leaf is included in a published zkVerify attestation.
    /// @param attestationId  Batch ID returned by Kurier after proof aggregation.
    /// @param leaf           keccak256 hash of (vkHash, publicInputsHash) — the proof leaf
    ///                       Kurier committed on-chain. See AnonClaim._proofLeaf().
    /// @param merklePath     Sibling hashes from Kurier's merkleProof.path.
    /// @param leafCount      Total leaf count in the attestation batch.
    /// @param leafIndex      This proof's index in the attestation batch.
    /// @return               True if the leaf is included in the attestation.
    function verifyProofAttestation(
        uint64 attestationId,
        bytes32 leaf,
        bytes32[] calldata merklePath,
        uint256 leafCount,
        uint256 leafIndex
    ) external view returns (bool);
}
