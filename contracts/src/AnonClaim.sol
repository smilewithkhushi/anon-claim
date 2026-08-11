// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {IZkVerify} from "./interfaces/IZkVerify.sol";

/// @title AnonClaim
/// @notice On-chain settlement for anonymous reward claims verified via Horizen's zkVerify.
///
/// Privacy model:
///   A user proves knowledge of a secret whose Poseidon2 commitment is a leaf in the
///   eligibility Merkle tree, without revealing which leaf. The Noir UltraHonk proof
///   is aggregated by Kurier and published to Horizen's zkVerify domain. This contract
///   verifies the attestation, enforces one-claim-per-identity via nullifiers, and pays
///   the reward to the recipient address bound into the proof.
///
/// Claim flow:
///   1. Frontend generates a Noir proof client-side (browser WASM).
///   2. Proof is submitted to Kurier → aggregated → zkVerify attestation published.
///   3. Anyone calls claim() with the attestation data. Contract verifies inclusion,
///      checks nullifier is unspent, marks it spent, transfers reward.
///
/// Circuit public inputs (must match circuit/src/main.nr):
///   root       bytes32   Eligibility Merkle root at proof time.
///   nullifier  bytes32   Poseidon2(secret, scope) — campaign-scoped, prevents double-claiming.
///   scope      bytes32   keccak256(abi.encode(address(this), campaignId)).
///   recipient  bytes32   Reward address, bound in-circuit to prevent front-running.
contract AnonClaim {
    // -------------------------------------------------------------------------
    // Immutables
    // -------------------------------------------------------------------------

    IZkVerify public immutable zkVerify;

    /// @notice VK hash returned by Kurier after POST /api/kurier/register-vk.
    ///         Set NEXT_PUBLIC_VK_HASH in .env.local to this value.
    bytes32 public immutable vkHash;

    /// @notice Campaign scope: keccak256(abi.encode(address(this), campaignId)).
    ///         Derived at construction time from the deployed address.
    ///         Set NEXT_PUBLIC_CAMPAIGN_SCOPE in .env.local to this value (read via scope()).
    bytes32 public immutable scope;

    /// @notice Reward paid per valid claim (in wei).
    uint256 public immutable rewardAmount;

    // -------------------------------------------------------------------------
    // State
    // -------------------------------------------------------------------------

    address public owner;

    /// @notice Current eligibility Merkle root.
    ///         Updated by the owner as new identity commitments are registered.
    ///         Set NEXT_PUBLIC_MERKLE_ROOT in .env.local (or read it from the contract).
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
    error AttestationInvalid();
    error InsufficientBalance();
    error TransferFailed();

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    /// @param _zkVerify      Horizen zkVerify attestation verifier contract address.
    /// @param _vkHash        VK hash from Kurier (register-vk response).
    /// @param _campaignId    Arbitrary campaign identifier, e.g. bytes32(uint256(1)).
    ///                       The scope is derived as keccak256(abi.encode(address(this), _campaignId)).
    /// @param _initialRoot   Starting eligibility Merkle root.
    ///                       Can be the empty-tree root initially; update via setMerkleRoot.
    /// @param _rewardAmount  Wei per successful claim. Fund the contract with enough ETH
    ///                       for all expected claims (rewardAmount × eligibleCount).
    constructor(
        address _zkVerify,
        bytes32 _vkHash,
        bytes32 _campaignId,
        bytes32 _initialRoot,
        uint256 _rewardAmount
    ) {
        zkVerify     = IZkVerify(_zkVerify);
        vkHash       = _vkHash;
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
    /// @param nullifier        Poseidon2(secret, scope) — from the circuit's public inputs.
    /// @param root             Eligibility Merkle root used when generating the proof.
    ///                         Must match the current merkleRoot stored in this contract.
    /// @param recipient        Reward destination. Must match the address bound into the proof.
    /// @param attestationId    Kurier job's attestationId.
    /// @param merklePath       Kurier job's merkleProof.path (sibling hashes).
    /// @param merkleLeafCount  Total leaves in the attestation batch.
    /// @param merkleLeafIndex  This proof's leaf index in the attestation batch.
    function claim(
        bytes32 nullifier,
        bytes32 root,
        address recipient,
        uint64  attestationId,
        bytes32[] calldata merklePath,
        uint256 merkleLeafCount,
        uint256 merkleLeafIndex
    ) external {
        if (recipient == address(0))              revert ZeroRecipient();
        if (nullifierUsed[nullifier])             revert NullifierSpent();
        if (root != merkleRoot)                   revert RootMismatch();
        if (address(this).balance < rewardAmount) revert InsufficientBalance();

        bytes32 leaf = _proofLeaf(root, nullifier, recipient);
        if (!zkVerify.verifyProofAttestation(attestationId, leaf, merklePath, merkleLeafCount, merkleLeafIndex)) {
            revert AttestationInvalid();
        }

        nullifierUsed[nullifier] = true;
        emit Claimed(nullifier, recipient, rewardAmount);

        (bool ok,) = recipient.call{value: rewardAmount}("");
        if (!ok) revert TransferFailed();
    }

    // -------------------------------------------------------------------------
    // Owner
    // -------------------------------------------------------------------------

    /// @notice Update the eligibility Merkle root after new identity registrations.
    ///         Also update NEXT_PUBLIC_MERKLE_ROOT in .env.local so the frontend
    ///         generates proofs against the correct root.
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

    // -------------------------------------------------------------------------
    // Internal
    // -------------------------------------------------------------------------

    /// @dev Reconstruct the proof leaf hash that Kurier committed on-chain.
    ///
    /// The Noir UltraHonk circuit has four public inputs (in declaration order):
    ///   root, nullifier, scope, recipient
    ///
    /// Kurier derives the leaf by hashing (vkHash, publicInputsHash) where publicInputsHash
    /// is the keccak256 of the ABI-encoded public inputs.
    ///
    /// TODO: Verify this encoding against Kurier's actual proof-leaf documentation before
    ///       deploying. If Kurier uses abi.encodePacked, a domain separator, or a different
    ///       field ordering, adjust the encoding here to match.
    function _proofLeaf(
        bytes32 root,
        bytes32 nullifier,
        address recipient
    ) internal view returns (bytes32) {
        bytes32 publicInputsHash = keccak256(abi.encode(
            root,
            nullifier,
            scope,
            bytes32(uint256(uint160(recipient)))
        ));
        return keccak256(abi.encode(vkHash, publicInputsHash));
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }
}
