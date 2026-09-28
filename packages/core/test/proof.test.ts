import test from "node:test";
import assert from "node:assert/strict";
import { inspectBytes, parseRawCid, verifyBytes, fetchVerifiedBlock, assertReceiptContent, receiptStatus, MAX_BYTES, ZERO_HASH } from "../src/index.ts";

const bytes = new TextEncoder().encode("abc");
const proof = await inspectBytes(bytes);

test("SHA-256 matches the independent standard abc test vector", () => {
  assert.equal(proof.sha256, "0xba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  assert.equal(proof.byteLength, 3);
  assert.equal(parseRawCid(proof.cid).code, 0x55);
});
test("changing one byte fails verification", async () => {
  await assert.rejects(verifyBytes(proof.cid, new TextEncoder().encode("abd")), /mismatch/);
  assert.deepEqual(await verifyBytes(proof.cid, bytes), proof);
});
test("non-raw and malformed CIDs are rejected before a request", () => {
  assert.throws(() => parseRawCid("not-a-cid"), /valid/);
  assert.throws(() => parseRawCid("QmYwAPJzv5CZsnAzt8auVZRnGiVbZ8xwZySGKQh2JNCShz"), /raw blocks/);
});
test("empty or oversized files are rejected", async () => {
  await assert.rejects(inspectBytes(new Uint8Array()), /non-empty/);
  await assert.rejects(inspectBytes(new Uint8Array(MAX_BYTES + 1)), /256 KiB/);
});
test("verified gateway bytes produce the same content proof", async () => {
  const mock: typeof fetch = async (url, options) => {
    assert.equal(url, `https://ipfs.io/ipfs/${proof.cid}?format=raw`);
    assert.equal(options?.redirect, "error");
    return new Response(bytes);
  };
  assert.deepEqual(await fetchVerifiedBlock(proof.cid, "https://ipfs.io", mock), proof);
});
test("gateway substitution, errors and untrusted length cannot pass", async () => {
  await assert.rejects(fetchVerifiedBlock(proof.cid, "https://ipfs.io", async () => new Response("wrong")), /mismatch/);
  await assert.rejects(fetchVerifiedBlock(proof.cid, "https://ipfs.io", async () => new Response("", { status: 404 })), /404/);
  await assert.rejects(fetchVerifiedBlock(proof.cid, "https://ipfs.io", async () => new Response(bytes, { headers: { "content-length": String(MAX_BYTES + 1) } })), /size limit/);
});
test("stream size is bounded even if content-length lies", async () => {
  let cancelled = false;
  const stream = new ReadableStream({
    pull(controller) { controller.enqueue(new Uint8Array(MAX_BYTES)); },
    cancel() { cancelled = true; },
  });
  await assert.rejects(fetchVerifiedBlock(proof.cid, "https://ipfs.io", async () => new Response(stream, { headers: { "content-length": "3" } })), /256 KiB/);
  assert.equal(cancelled, true);
});
test("gateway must be a clean HTTPS origin", async () => {
  for (const gateway of ["http://localhost", "https://user:secret@example.com", "https://example.com/a", "https://example.com/?a=1"]) {
    await assert.rejects(fetchVerifiedBlock(proof.cid, gateway, async () => { throw new Error("must not fetch"); }), /HTTPS gateway/);
  }
});
test("on-chain hash and byte length must both match", () => {
  assertReceiptContent(proof, { contentHash: proof.sha256, byteLength: 3n });
  assert.throws(() => assertReceiptContent(proof, { contentHash: ZERO_HASH, byteLength: 3n }), /on-chain/);
  assert.throws(() => assertReceiptContent(proof, { contentHash: proof.sha256, byteLength: 4n }), /on-chain/);
});
test("revoked and superseded receipts do not appear current", () => {
  assert.equal(receiptStatus({ revoked: false, successor: ZERO_HASH }), "Current");
  assert.equal(receiptStatus({ revoked: false, successor: proof.sha256 }), "Superseded");
  assert.equal(receiptStatus({ revoked: true, successor: proof.sha256 }), "Revoked");
});
