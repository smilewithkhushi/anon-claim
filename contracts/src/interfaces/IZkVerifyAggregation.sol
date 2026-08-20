// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title IZkVerifyAggregation
/// @notice Interface for the ZkVerifyAggregation contract deployed on Horizen testnet.
///         Proxy address: 0xCC02D0A54F3184dF4c88811E5b9FAb7ff8131e4a  ← USE THIS
///         Implementation: 0x03225ff1ff4F1BAc6e81BB6317006A509422D51C  ← do NOT use (state is empty)
///
///         This contract receives aggregation proofs from the zkVerify chain and exposes
///         verifyProofAggregation so application contracts can confirm that a specific
///         proof leaf was included in a published aggregation batch.
interface IZkVerifyAggregation {
    /// @notice Verify that a proof leaf is included in a published zkVerify aggregation.
    /// @param _domainId      Domain ID identifying the destination chain on zkVerify.
    ///                       Provided by Kurier in the job status response.
    /// @param _aggregationId Aggregation batch ID. Provided by Kurier.
    /// @param _leaf          Proof leaf hash. Provided by Kurier (do NOT recompute on-chain).
    /// @param _merklePath    Sibling hashes for the Merkle inclusion proof. From Kurier.
    /// @param _leafCount     Total leaves in the aggregation batch. From Kurier.
    /// @param _index         This proof's leaf index in the batch. From Kurier.
    /// @return               True if the leaf is included in the aggregation.
    function verifyProofAggregation(
        uint256 _domainId,
        uint256 _aggregationId,
        bytes32 _leaf,
        bytes32[] calldata _merklePath,
        uint256 _leafCount,
        uint256 _index
    ) external view returns (bool);
}
