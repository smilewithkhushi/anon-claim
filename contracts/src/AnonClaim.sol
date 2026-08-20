// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IZkVerifyAggregation} from "./interfaces/IZkVerifyAggregation.sol";

/// @title AnonClaim
/// @notice On-chain settlement for anonymous reward claims verified via Horizen's zkVerify.
///
/// Privacy model:
///   A user proves knowledge of a secret whose Poseidon2 commitment is a leaf in the
///   eligibility Merkle tree, without revealing which leaf. The Noir UltraHonk proof
///   is submitted to Kurier, which verifies it against the registered VK, aggregates it
///   with other proofs, and publishes the aggregation to the ZkVerifyAggregation contract
///   on Horizen testnet. This contract verifies the inclusion, enforces one-claim-per-
///   identity via nullifiers, and pays the reward to the recipient.
///
/// Claim flow:
///   1. Frontend generates a Noir proof client-side (browser WASM).
///   2. Proof → Kurier → zkVerify aggregation published on-chain.
///   3. Frontend calls claim() with the Kurier aggregation data.
///      Contract verifies inclusion, checks nullifier is unspent, pays out.
///
/// Circuit public inputs (must match circuit/src/main.nr):
///   root       bytes32   Eligibility Merkle root at proof time.
///   nullifier  bytes32   Poseidon2(secret, scope) — prevents double-claiming.
///   scope      bytes32   keccak256(abi.encode(address(this), campaignId)).
///   recipient  bytes32   Reward address, bound in-circuit to prevent front-running.
contract AnonClaim {
    // -------------------------------------------------------------------------
    // Constants
    // -------------------------------------------------------------------------

    /// @notice ZkVerifyAggregation proxy contract on Horizen testnet.
    ///         This is the ERC1967Proxy (0xCC02D0A5...) — NOT the implementation (0x03225ff1...).
    ///         The implementation's proofsAggregations mapping is always empty; only the proxy holds state.
    IZkVerifyAggregation public constant ZK_VERIFY =
        IZkVerifyAggregation(0xCC02D0A54F3184dF4c88811E5b9FAb7ff8131e4a);

    // -------------------------------------------------------------------------
    // Immutables
    // -------------------------------------------------------------------------

    /// @notice Campaign scope: keccak256(abi.encode(address(this), campaignId)).
    ///         Set NEXT_PUBLIC_CAMPAIGN_SCOPE in .env.local to this value after deployment.
    ///         Read it with: cast call $CONTRACT "scope()(bytes32)" --rpc-url $RPC
    bytes32 public immutable scope;

    /// @notice Reward paid per valid claim (in wei).
    uint256 public immutable rewardAmount;

    // -------------------------------------------------------------------------
    // State
    // -------------------------------------------------------------------------

    address public owner;

    /// @notice Current eligibility Merkle root.
    ///         Updated by the owner as new identity commitments are registered.
    bytes32 public merkleRoot;

    mapping(bytes32 => bool) public nullifierUsed;

    // -------------------------------------------------------------------------
    // Events / Errors
    // -------------------------------------------------------------------------

    event Claimed(bytes32 indexed nullifier, address indexed recipient, uint256 amount);
    event MerkleRootUpdated(bytes32 oldRoot, bytes32 newRoot);
    event OwnershipTransferred(address indexed oldOwner, address indexed newOwner);

    error NotOwner();
    error ZeroRecipient();
    error NullifierSpent();
    error RootMismatch();
    error AggregationInvalid();
    error InsufficientBalance();
    error TransferFailed();

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    /// @param _campaignId   Arbitrary campaign identifier, e.g. bytes32(uint256(1)).
    ///                      scope = keccak256(abi.encode(address(this), _campaignId)).
    /// @param _initialRoot  Starting eligibility Merkle root. Update via setMerkleRoot
    ///                      as registrations accumulate.
    /// @param _rewardAmount Wei per successful claim. Fund the contract with
    ///                      rewardAmount × eligibleCount before the campaign opens.
    constructor(
        bytes32 _campaignId,
        bytes32 _initialRoot,
        uint256 _rewardAmount
    ) {
        scope        = keccak256(abi.encode(address(this), _campaignId));
        merkleRoot   = _initialRoot;
        rewardAmount = _rewardAmount;
        owner        = msg.sender;
    }

    // -------------------------------------------------------------------------
    // Claim
    // -------------------------------------------------------------------------

    /// @notice Claim reward by presenting a Kurier-attested ZK proof.
    ///
    /// All aggregation fields (_domainId, _aggregationId, _leaf, _merklePath,
    /// _leafCount, _index) come directly from the Kurier job status response.
    ///
    /// @param nullifier      Poseidon2(secret, scope) — circuit public input.
    /// @param root           Eligibility Merkle root used to generate the proof.
    ///                       Must match the current merkleRoot in this contract.
    /// @param recipient      Reward destination. Must match the address bound into the proof.
    /// @param _domainId      zkVerify domain ID (from Kurier response).
    /// @param _aggregationId Aggregation batch ID (from Kurier response).
    /// @param _leaf          Proof leaf hash (from Kurier response — do not recompute).
    /// @param _merklePath    Merkle sibling hashes (from Kurier response).
    /// @param _leafCount     Total leaves in the batch (from Kurier response).
    /// @param _index         This proof's leaf index (from Kurier response).
    function claim(
        bytes32 nullifier,
        bytes32 root,
        address recipient,
        uint256 _domainId,
        uint256 _aggregationId,
        bytes32 _leaf,
        bytes32[] calldata _merklePath,
        uint256 _leafCount,
        uint256 _index
    ) external {
        if (recipient == address(0))              revert ZeroRecipient();
        if (nullifierUsed[nullifier])             revert NullifierSpent();
        if (root != merkleRoot)                   revert RootMismatch();
        if (address(this).balance < rewardAmount) revert InsufficientBalance();

        if (!ZK_VERIFY.verifyProofAggregation(_domainId, _aggregationId, _leaf, _merklePath, _leafCount, _index)) {
            revert AggregationInvalid();
        }

        nullifierUsed[nullifier] = true;
        emit Claimed(nullifier, recipient, rewardAmount);

        (bool ok,) = recipient.call{value: rewardAmount}("");
        if (!ok) revert TransferFailed();
    }

    // -------------------------------------------------------------------------
    // Owner
    // -------------------------------------------------------------------------

    /// @notice Update the eligibility Merkle root after new registrations.
    function setMerkleRoot(bytes32 newRoot) external onlyOwner {
        emit MerkleRootUpdated(merkleRoot, newRoot);
        merkleRoot = newRoot;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    /// @notice Recover remaining ETH after the campaign ends.
    function withdraw() external onlyOwner {
        (bool ok,) = owner.call{value: address(this).balance}("");
        if (!ok) revert TransferFailed();
    }

    receive() external payable {}

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }
}
