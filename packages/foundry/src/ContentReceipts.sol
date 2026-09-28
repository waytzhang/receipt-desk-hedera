// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @notice Publisher attestations about raw IPFS blocks. No tokens or custody.
/// @dev A receipt proves what a key asserted, not the truth or authorship of a document.
contract ContentReceipts {
    uint32 public constant MAX_BYTES = 262144;

    struct Receipt {
        address publisher;
        uint64 recordedAt;
        uint32 byteLength;
        bool revoked;
        bytes32 contentHash;
        bytes32 contextHash;
        bytes32 predecessor;
        bytes32 successor;
    }

    mapping(bytes32 => Receipt) private receipts;

    error InvalidContent();
    error NotFound();
    error NotPublisher();
    error Duplicate();
    error InactivePredecessor();
    error ContextMismatch();
    error AlreadyRevoked();

    event Recorded(
        bytes32 indexed id,
        address indexed publisher,
        bytes32 indexed contextHash,
        bytes32 contentHash,
        uint32 byteLength,
        bytes32 predecessor
    );
    event Revoked(bytes32 indexed id, address indexed publisher);

    function get(bytes32 id) external view returns (Receipt memory receipt) {
        receipt = receipts[id];
        if (receipt.publisher == address(0)) revert NotFound();
    }

    function computeId(
        address publisher,
        bytes32 contentHash,
        uint32 byteLength,
        bytes32 contextHash,
        bytes32 predecessor
    ) public view returns (bytes32) {
        return keccak256(
            abi.encode(block.chainid, address(this), publisher, contentHash, byteLength, contextHash, predecessor)
        );
    }

    function record(bytes32 contentHash, uint32 byteLength, bytes32 contextHash, bytes32 predecessor)
        external
        returns (bytes32 id)
    {
        if (contentHash == bytes32(0) || byteLength == 0 || byteLength > MAX_BYTES) revert InvalidContent();
        id = computeId(msg.sender, contentHash, byteLength, contextHash, predecessor);
        if (receipts[id].publisher != address(0)) revert Duplicate();
        if (predecessor != bytes32(0)) {
            Receipt storage previous = receipts[predecessor];
            if (previous.publisher == address(0)) revert NotFound();
            if (previous.publisher != msg.sender) revert NotPublisher();
            if (previous.revoked || previous.successor != bytes32(0)) revert InactivePredecessor();
            if (previous.contextHash != contextHash) revert ContextMismatch();
            previous.successor = id;
        }
        receipts[id] = Receipt(
            msg.sender, uint64(block.timestamp), byteLength, false, contentHash, contextHash, predecessor, bytes32(0)
        );
        emit Recorded(id, msg.sender, contextHash, contentHash, byteLength, predecessor);
    }

    function revoke(bytes32 id) external {
        Receipt storage receipt = receipts[id];
        if (receipt.publisher == address(0)) revert NotFound();
        if (receipt.publisher != msg.sender) revert NotPublisher();
        if (receipt.revoked) revert AlreadyRevoked();
        receipt.revoked = true;
        emit Revoked(id, msg.sender);
    }
}
