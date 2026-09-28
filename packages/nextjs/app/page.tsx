import ReceiptDesk from "./receipt-desk";
import Link from "next/link";

export default function Page() {
  return <main>
    <header className="masthead"><Link className="wordmark" href="/">Receipt Desk<span>RD / 01</span></Link><span className="network">Hedera testnet · 296</span></header>
    <section className="intro"><p className="eyebrow">PUBLIC DOCUMENTS / INDEPENDENT VERIFICATION</p><h1>The same file.<br />A verifiable record.</h1><p className="lede">Check the bytes behind an IPFS address, then compare them with a publisher’s receipt. Revisions and withdrawals stay visible.</p></section>
    <ReceiptDesk />
    <footer><p>A receipt records a publisher’s assertion. It does not establish that a document is true, authorized, or permanently available.</p><p>Small public files · Raw IPFS blocks · No token custody</p></footer>
  </main>;
}
