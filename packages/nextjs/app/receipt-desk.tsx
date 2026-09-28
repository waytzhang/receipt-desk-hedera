"use client";

import { useRef, useState } from "react";
import { BrowserProvider, Contract, JsonRpcProvider, getAddress, id, isHexString, type Eip1193Provider } from "ethers";
import { REGISTRY_ABI, ZERO_HASH, TESTNET_CHAIN_ID, MAX_BYTES, inspectBytes, verifyBytes, fetchVerifiedBlock, assertReceiptContent, receiptStatus, type ContentProof } from "@sh/receipt-core";

const RPC = "https://testnet.hashio.io/api";
type Receipt = { publisher: string; recordedAt: bigint; byteLength: bigint; revoked: boolean; contentHash: string; contextHash: string; predecessor: string; successor: string };
type LocatedReceipt = { id: string; address: string; value: Receipt; matches: boolean };

function explain(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 400) : "The operation did not complete. Please try again.";
}
function short(value: string) { return `${value.slice(0, 10)}…${value.slice(-8)}`; }

export default function ReceiptDesk() {
  const [cid, setCid] = useState("");
  const [gateway, setGateway] = useState("https://ipfs.io");
  const [proof, setProof] = useState<ContentProof | null>(null);
  const [origin, setOrigin] = useState("");
  const [address, setAddress] = useState(process.env.NEXT_PUBLIC_RECEIPT_REGISTRY || "");
  const [receiptId, setReceiptId] = useState("");
  const [context, setContext] = useState("public-document");
  const [predecessor, setPredecessor] = useState("");
  const [located, setLocated] = useState<LocatedReceipt | null>(null);
  const [transaction, setTransaction] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Ready. Start with a public IPFS CID or a small local file.");
  const [failed, setFailed] = useState(false);
  const sequence = useRef(0);

  function invalidate(clearProof = false) {
    sequence.current++;
    setBusy(false);
    setLocated(null);
    setTransaction("");
    if (clearProof) { setProof(null); setOrigin(""); }
    setMessage("Inputs changed. Run the check again.");
    setFailed(false);
  }

  async function run<T>(work: () => Promise<T>, apply: (value: T) => void) {
    const current = ++sequence.current;
    setBusy(true); setFailed(false); setMessage("Working…");
    try {
      const value = await work();
      if (sequence.current === current) apply(value);
    } catch (error) {
      if (sequence.current === current) { setFailed(true); setMessage(explain(error)); }
    } finally { if (sequence.current === current) setBusy(false); }
  }

  function acceptProof(value: ContentProof, source: string) {
    setProof(value); setCid(value.cid); setOrigin(source); setLocated(null);
    setMessage("Content bytes verified. This is not yet an on-chain receipt.");
  }

  async function readReceipt(contractAddress: string, key: string) {
    if (!isHexString(key, 32)) throw new Error("Receipt ID must be a 32-byte hexadecimal value.");
    const provider = new JsonRpcProvider(RPC);
    try {
      if ((await provider.getNetwork()).chainId !== BigInt(TESTNET_CHAIN_ID)) throw new Error("Unexpected network. Expected Hedera testnet.");
      const contract = new Contract(getAddress(contractAddress.trim()), REGISTRY_ABI, provider);
      const r = await contract.get(key);
      return { publisher: r.publisher, recordedAt: r.recordedAt, byteLength: r.byteLength, revoked: r.revoked, contentHash: r.contentHash, contextHash: r.contextHash, predecessor: r.predecessor, successor: r.successor } as Receipt;
    } finally { provider.destroy(); }
  }

  function checkReceipt() {
    const a = address.trim(), key = receiptId.trim(), p = proof;
    void run(async () => {
      if (!p) throw new Error("Verify the content bytes first.");
      const receipt = await readReceipt(a, key);
      let matches = true;
      try { assertReceiptContent(p, receipt); } catch { matches = false; }
      return { id: key, address: getAddress(a), value: receipt, matches };
    }, value => {
      setLocated(value);
      setFailed(!value.matches);
      setMessage(value.matches ? `Bytes match this receipt. Publisher status: ${receiptStatus(value.value)}.` : "Content mismatch: this receipt refers to different bytes or a different length.");
    });
  }

  async function signerContract() {
    const ethereum = (window as Window & { ethereum?: Eip1193Provider }).ethereum;
    if (!ethereum) throw new Error("Install an EVM wallet to publish. Reading and file checks work without one.");
    const provider = new BrowserProvider(ethereum);
    await provider.send("eth_requestAccounts", []);
    if ((await provider.getNetwork()).chainId !== BigInt(TESTNET_CHAIN_ID)) throw new Error("Switch your wallet to Hedera testnet (chain 296), then retry.");
    const checkedAddress = getAddress(address.trim());
    if ((await provider.getCode(checkedAddress)) === "0x") throw new Error("No contract was found at this address on Hedera testnet.");
    return new Contract(checkedAddress, REGISTRY_ABI, await provider.getSigner());
  }

  function publish() {
    const p = proof, prior = predecessor.trim() || ZERO_HASH, label = context.trim();
    void run(async () => {
      if (!p) throw new Error("Verify content before publishing.");
      if (!label || new TextEncoder().encode(label).length > 256) throw new Error("Use a context label of 1–256 UTF-8 bytes.");
      if (!isHexString(prior, 32)) throw new Error("Previous receipt ID must be empty or 32-byte hexadecimal.");
      const contract = await signerContract();
      const tx = await contract.record(p.sha256, p.byteLength, id(label), prior, { chainId: TESTNET_CHAIN_ID });
      const result = await tx.wait();
      if (!result || result.status !== 1) throw new Error(`Transaction did not succeed: ${tx.hash}`);
      for (const log of result.logs) {
        if (log.address.toLowerCase() !== String(contract.target).toLowerCase()) continue;
        const parsed = contract.interface.parseLog(log);
        if (parsed?.name === "Recorded") return { hash: tx.hash as string, id: parsed.args.id as string };
      }
      throw new Error(`Transaction mined without the expected receipt event: ${tx.hash}`);
    }, result => {
      setTransaction(result.hash); setReceiptId(result.id); setLocated(null);
      setMessage("Receipt recorded on testnet. Use Check receipt to independently read and compare it.");
    });
  }

  function revoke() {
    const target = located;
    void run(async () => {
      if (!target || target.address.toLowerCase() !== address.trim().toLowerCase()) throw new Error("Read the receipt first.");
      const contract = await signerContract();
      const tx = await contract.revoke(target.id, { chainId: TESTNET_CHAIN_ID });
      const result = await tx.wait();
      if (!result || result.status !== 1) throw new Error(`Withdrawal did not succeed: ${tx.hash}`);
      return tx.hash as string;
    }, hash => { setTransaction(hash); setLocated(null); setMessage("Receipt withdrawn. Its historical contents remain on-chain; check it again to see the new status."); });
  }

  return <>
    <div className={`status ${failed ? "error" : ""}`} role="status" aria-live="polite"><span>{busy ? "IN PROGRESS" : failed ? "CHECK FAILED" : "WORKSPACE"}</span><p>{message}</p></div>
    <div className="workspace">
      <section className="panel" aria-labelledby="content-title">
        <p className="step">01 / CONTENT</p><h2 id="content-title">Check the file</h2>
        <p className="help">CIDv1 raw blocks, up to 256 KiB. Gateway downloads are checked against the CID, byte for byte.</p>
        <label htmlFor="cid">IPFS content identifier</label><input id="cid" placeholder="bafkre…" value={cid} disabled={busy} onChange={e => { setCid(e.target.value); invalidate(true); }} spellCheck={false} />
        <label htmlFor="gateway">HTTPS gateway</label><input id="gateway" value={gateway} disabled={busy} onChange={e => { setGateway(e.target.value); invalidate(true); }} spellCheck={false} />
        <button className="primary" disabled={busy || !cid.trim()} onClick={() => { setProof(null); setLocated(null); void run(() => fetchVerifiedBlock(cid, gateway), p => acceptProof(p, "Verified gateway download")); }}>Fetch and verify</button>
        <div className="divider">or inspect a file already on your device</div>
        <label className="file-label" htmlFor="file">Choose a small file<input id="file" type="file" disabled={busy} onChange={e => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          setProof(null); setLocated(null);
          void run(async () => {
            if (file.size < 1 || file.size > MAX_BYTES) throw new Error("Choose a non-empty file of at most 256 KiB.");
            const bytes = new Uint8Array(await file.arrayBuffer());
            return cid.trim() ? verifyBytes(cid, bytes) : inspectBytes(bytes);
          }, p => acceptProof(p, "Verified local file · not uploaded"));
        }} /></label>
        <p className="help small">A local file stays in this browser. Leave the CID blank to derive it, or enter a CID to compare. This app does not upload or pin files.</p>
        {proof && <div className="proof"><strong>{origin}</strong><dl><dt>Size</dt><dd>{proof.byteLength.toLocaleString()} bytes</dd><dt>SHA-256</dt><dd className="mono">{proof.sha256}</dd><dt>Raw CID</dt><dd className="mono">{proof.cid}</dd></dl><button disabled={busy} onClick={() => { setCid(""); invalidate(true); }}>Clear file check</button></div>}
      </section>
      <section className="panel" aria-labelledby="receipt-title">
        <p className="step">02 / PUBLISHER RECORD</p><h2 id="receipt-title">Read the receipt</h2>
        <p className="help">Paste a deployed Receipt Desk registry and a receipt ID. Read access does not require a wallet.</p>
        <label htmlFor="registry">Testnet registry address</label><input id="registry" placeholder="0x…" value={address} disabled={busy} onChange={e => { setAddress(e.target.value); invalidate(); }} spellCheck={false} />
        <label htmlFor="receipt-id">Receipt ID</label><input id="receipt-id" placeholder="0x…" value={receiptId} disabled={busy} onChange={e => { setReceiptId(e.target.value); invalidate(); }} spellCheck={false} />
        <button disabled={busy || !proof || !address || !receiptId} onClick={checkReceipt}>Check receipt</button>
        {located && <div className={`proof ${located.matches ? "" : "mismatch"}`}><strong>{located.matches ? "Content matches" : "Content does not match"} · {receiptStatus(located.value)}</strong><dl>
          <dt>Publisher</dt><dd className="mono" title={located.value.publisher}>{located.value.publisher}</dd>
          <dt>Recorded</dt><dd>{new Date(Number(located.value.recordedAt) * 1000).toISOString()}</dd>
          <dt>Context hash</dt><dd className="mono">{located.value.contextHash}</dd>
          <dt>Previous version</dt><dd className="mono">{located.value.predecessor === ZERO_HASH ? "None" : located.value.predecessor}</dd>
          <dt>Next version</dt><dd className="mono">{located.value.successor === ZERO_HASH ? "None" : located.value.successor}</dd>
        </dl><a href={`https://hashscan.io/testnet/contract/${located.address}`} target="_blank" rel="noreferrer">Open registry on HashScan ↗</a>
        {!located.value.revoked && <button className="withdraw" disabled={busy} onClick={revoke}>Withdraw receipt as publisher</button>}</div>}
        <details className="publish"><summary>Publish a receipt for these bytes</summary><p className="help">This creates a public testnet attestation from your wallet. The document’s hash, size and version links are public. Use only public material.</p>
          <label htmlFor="context">Context label</label><input id="context" value={context} disabled={busy} onChange={e => { setContext(e.target.value); invalidate(); }} />
          <p className="help small">The trimmed label is hashed. Keep it identical across versions.</p>
          <label htmlFor="previous">Previous receipt ID <span className="muted">(optional)</span></label><input id="previous" value={predecessor} disabled={busy} onChange={e => { setPredecessor(e.target.value); invalidate(); }} placeholder="First version: leave blank" spellCheck={false} />
          <button className="primary" disabled={busy || !proof || !address} onClick={publish}>Review in wallet and publish</button>
        </details>
        {transaction && <p className="transaction"><a href={`https://hashscan.io/testnet/transaction/${transaction}`} target="_blank" rel="noreferrer">View transaction {short(transaction)} ↗</a></p>}
      </section>
    </div>
  </>;
}
