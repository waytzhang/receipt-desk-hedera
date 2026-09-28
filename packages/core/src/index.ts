import { CID } from "multiformats/cid";
import * as raw from "multiformats/codecs/raw";
import { sha256 } from "multiformats/hashes/sha2";

export const MAX_BYTES = 262144;
export const TESTNET_CHAIN_ID = 296;
export const ZERO_HASH = `0x${"0".repeat(64)}`;
export const REGISTRY_ABI = [
  "function record(bytes32 contentHash,uint32 byteLength,bytes32 contextHash,bytes32 predecessor) returns (bytes32)",
  "function get(bytes32 id) view returns (tuple(address publisher,uint64 recordedAt,uint32 byteLength,bool revoked,bytes32 contentHash,bytes32 contextHash,bytes32 predecessor,bytes32 successor))",
  "function revoke(bytes32 id)",
  "event Recorded(bytes32 indexed id,address indexed publisher,bytes32 indexed contextHash,bytes32 contentHash,uint32 byteLength,bytes32 predecessor)",
  "event Revoked(bytes32 indexed id,address indexed publisher)",
] as const;

export type ContentProof = { cid: string; sha256: string; byteLength: number };

export function parseRawCid(input: string) {
  let cid: CID;
  try {
    cid = CID.parse(input.trim());
  } catch {
    throw new Error("Enter a valid IPFS CID.");
  }
  if (
    cid.version !== 1 ||
    cid.code !== raw.code ||
    cid.multihash.code !== sha256.code ||
    cid.multihash.size !== 32
  ) {
    throw new Error(
      "This template accepts CIDv1 raw blocks using SHA-256. UnixFS directories and multi-block files need a DAG verifier.",
    );
  }
  return cid;
}

export async function inspectBytes(bytes: Uint8Array): Promise<ContentProof> {
  if (bytes.length < 1 || bytes.length > MAX_BYTES)
    throw new Error("Choose a non-empty file of at most 256 KiB.");
  const hash = await sha256.digest(bytes);
  return {
    cid: CID.createV1(raw.code, hash).toString(),
    sha256: `0x${Array.from(hash.digest, (x) => x.toString(16).padStart(2, "0")).join("")}`,
    byteLength: bytes.length,
  };
}

export async function verifyBytes(
  cidInput: string,
  bytes: Uint8Array,
): Promise<ContentProof> {
  const expected = parseRawCid(cidInput);
  const proof = await inspectBytes(bytes);
  if (!CID.parse(proof.cid).equals(expected))
    throw new Error("Content mismatch: these bytes do not match this CID.");
  return proof;
}

export async function fetchVerifiedBlock(
  cidInput: string,
  gateway = "https://ipfs.io",
  fetcher: typeof fetch = fetch,
): Promise<ContentProof> {
  const cid = parseRawCid(cidInput).toString();
  const origin = new URL(gateway);
  if (
    origin.protocol !== "https:" ||
    origin.username ||
    origin.password ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash
  ) {
    throw new Error(
      "Use an HTTPS gateway origin without a path or credentials.",
    );
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    const response = await fetcher(`${origin.origin}/ipfs/${cid}?format=raw`, {
      signal: controller.signal,
      redirect: "error",
      headers: { Accept: "application/vnd.ipld.raw" },
    });
    if (!response.ok)
      throw new Error(`Gateway returned HTTP ${response.status}.`);
    const declaredSize = response.headers.get("content-length");
    if (
      declaredSize !== null &&
      (!/^\d+$/.test(declaredSize) || Number(declaredSize) > MAX_BYTES)
    )
      throw new Error(
        "Gateway response exceeds the size limit or has an invalid length.",
      );
    if (!response.body) throw new Error("Gateway returned no response body.");
    reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      length += next.value.length;
      if (length > MAX_BYTES)
        throw new Error("Gateway response exceeds 256 KiB.");
      chunks.push(next.value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    return await verifyBytes(cid, bytes);
  } finally {
    clearTimeout(timeout);
    if (reader) await reader.cancel().catch(() => undefined);
    controller.abort();
  }
}

export function assertReceiptContent(
  proof: ContentProof,
  receipt: { contentHash: string; byteLength: bigint | number },
) {
  if (
    receipt.contentHash.toLowerCase() !== proof.sha256 ||
    BigInt(receipt.byteLength) !== BigInt(proof.byteLength)
  ) {
    throw new Error("These bytes do not match the on-chain receipt.");
  }
}

export function receiptStatus(receipt: {
  revoked: boolean;
  successor: string;
}) {
  if (receipt.revoked) return "Revoked";
  if (receipt.successor !== ZERO_HASH) return "Superseded";
  return "Current";
}
