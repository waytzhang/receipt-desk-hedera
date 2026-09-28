# Working on Receipt Desk

This is a Hedera testnet template built with Codex. Keep claims about verification precise; update VERIFICATION.md from actual results.

- Never commit secrets, .env files, wallets, provider credentials, node_modules, or private material. Deployment evidence may include public addresses and transaction hashes only.
- Preserve the raw-CID/SHA-256 verification boundary. HTTP success is not content verification. Do not treat a UnixFS root CID as a direct file digest.
- Keep the 256 KiB streamed download limit and timeout. Input changes invalidate previously displayed proof.
- Keep byte matching separate from publisher status. Revocation and supersession must remain visible.
- Keep writes on chain 296. No server signing endpoint, custody, payments, or automatic mainnet fallback.
- Preserve publisher ownership and context invariants in version links. History must never be overwritten by a new receipt.
- Run `npm test`, `npm run foundry:test`, `npm run lint`, and `npm run build` after relevant changes. Browser-check local file success, mismatch, stale-proof clearing, and narrow-screen layout.
- Contract deployment, wallet interaction, live IPFS retrieval, scaffolding, and contest submission need their own evidence; do not infer them from unit tests.
- Read packages/nextjs/AGENTS.md before modifying the Next.js application.
