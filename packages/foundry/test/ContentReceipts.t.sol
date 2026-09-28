// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {ContentReceipts} from "../src/ContentReceipts.sol";

interface Vm {
    function prank(address) external;
    function expectRevert(bytes4) external;
    function warp(uint256) external;
    function chainId(uint256) external;
}

contract ContentReceiptsTest {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    ContentReceipts private registry;
    bytes32 private constant HASH = keccak256("content");
    bytes32 private constant CONTEXT = keccak256("context");

    function setUp() public {
        registry = new ContentReceipts();
    }

    function testRecordedDataAndTimestampArePreserved() public {
        vm.warp(123456);
        bytes32 id = registry.record(HASH, 25, CONTEXT, 0);
        ContentReceipts.Receipt memory r = registry.get(id);
        require(r.publisher == address(this) && r.recordedAt == 123456);
        require(r.contentHash == HASH && r.byteLength == 25 && r.contextHash == CONTEXT);
        require(!r.revoked && r.predecessor == 0 && r.successor == 0);
    }

    function testDuplicateCannotOverwriteHistory() public {
        registry.record(HASH, 25, CONTEXT, 0);
        vm.expectRevert(ContentReceipts.Duplicate.selector);
        registry.record(HASH, 25, CONTEXT, 0);
    }

    function testVersionLinksAreBidirectional() public {
        bytes32 first = registry.record(HASH, 25, CONTEXT, 0);
        bytes32 second = registry.record(bytes32(uint256(2)), 30, CONTEXT, first);
        require(registry.get(first).successor == second);
        require(registry.get(second).predecessor == first);
        require(registry.get(first).contentHash == HASH);
        vm.expectRevert(ContentReceipts.InactivePredecessor.selector);
        registry.record(bytes32(uint256(3)), 40, CONTEXT, first);
    }

    function testOtherPublisherCannotSupersedeOrRevoke() public {
        bytes32 id = registry.record(HASH, 25, CONTEXT, 0);
        vm.expectRevert(ContentReceipts.NotPublisher.selector);
        vm.prank(address(0xBEEF));
        registry.record(bytes32(uint256(2)), 30, CONTEXT, id);
        vm.expectRevert(ContentReceipts.NotPublisher.selector);
        vm.prank(address(0xBEEF));
        registry.revoke(id);
    }

    function testRevocationPreservesRecordAndBlocksSuccessor() public {
        bytes32 id = registry.record(HASH, 25, CONTEXT, 0);
        registry.revoke(id);
        require(registry.get(id).revoked && registry.get(id).contentHash == HASH);
        vm.expectRevert(ContentReceipts.InactivePredecessor.selector);
        registry.record(bytes32(uint256(2)), 30, CONTEXT, id);
        vm.expectRevert(ContentReceipts.AlreadyRevoked.selector);
        registry.revoke(id);
    }

    function testContextCannotChangeWithinVersionChain() public {
        bytes32 id = registry.record(HASH, 25, CONTEXT, 0);
        vm.expectRevert(ContentReceipts.ContextMismatch.selector);
        registry.record(bytes32(uint256(2)), 30, bytes32(uint256(99)), id);
        require(registry.get(id).successor == 0);
    }

    function testUnknownIdsFail() public {
        vm.expectRevert(ContentReceipts.NotFound.selector);
        registry.get(HASH);
        vm.expectRevert(ContentReceipts.NotFound.selector);
        registry.revoke(HASH);
        vm.expectRevert(ContentReceipts.NotFound.selector);
        registry.record(HASH, 25, CONTEXT, HASH);
    }

    function testInvalidContentRejected() public {
        vm.expectRevert(ContentReceipts.InvalidContent.selector);
        registry.record(0, 25, CONTEXT, 0);
        vm.expectRevert(ContentReceipts.InvalidContent.selector);
        registry.record(HASH, 0, CONTEXT, 0);
        vm.expectRevert(ContentReceipts.InvalidContent.selector);
        registry.record(HASH, 262145, CONTEXT, 0);
    }

    function testSameDocumentCanBeAttestedByDifferentPublishers() public {
        bytes32 a = registry.record(HASH, 25, CONTEXT, 0);
        vm.prank(address(0xBEEF));
        bytes32 b = registry.record(HASH, 25, CONTEXT, 0);
        require(a != b && registry.get(b).publisher == address(0xBEEF));
    }

    function testReceiptIdIsBoundToChainAndRegistry() public {
        bytes32 a = registry.computeId(address(this), HASH, 25, CONTEXT, 0);
        ContentReceipts other = new ContentReceipts();
        require(other.computeId(address(this), HASH, 25, CONTEXT, 0) != a);
        vm.chainId(block.chainid + 1);
        require(registry.computeId(address(this), HASH, 25, CONTEXT, 0) != a);
    }

    function testFuzzValidSizePreserved(uint32 size) public {
        uint32 valid = (size % 262144) + 1;
        bytes32 id = registry.record(HASH, valid, CONTEXT, 0);
        require(registry.get(id).byteLength == valid);
    }
}
