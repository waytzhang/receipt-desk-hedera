# Verification record

Last checked: 29 September 2026 (Asia/Shanghai). This is a development template. No contest submission, prize, audit, or production use is claimed.

## Completed locally

Environment: Node.js 24.19.0, npm workspaces, Next.js 16.3.6, Foundry 1.8.3, Solidity 0.8.30. Lockfile, lint, and production build completed with exit code 0.

- `npm test`: 10 content-verification tests passed, covering the known SHA-256 vector, altered content, unsupported CIDs, size limits, mocked gateway responses, streamed overflow/cancellation, gateway-origin validation, receipt matching, and status display.
- `npm run foundry:test`: 11 contract tests passed, including a 256-run size-bound fuzz test. Publisher ownership, predecessor validity, context preservation, duplicate prevention, revocation and version links are covered.
- `npm run lint` and `npm run build`: passed. The production build generated the root route and not-found route.
- Browser at `http://127.0.0.1:3216`: application booted. Selecting the three-byte `examples/abc.txt` produced the expected proof. Selecting `examples/changed.txt` with the original CID produced a mismatch and removed the stale proof. Desktop and 768-pixel tablet layouts were inspected; no horizontal overflow or application JavaScript error was observed.

Known sample:

```text
bytes: abc (no newline)
length: 3
CID: bafkreif2pall7dybz7vecqka3zo24irdwabwdi4wc55jznaq75q7eaavvu
SHA-256: ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad
```

## Live checks still open

- Live IPFS retrieval has **not passed**. The browser showed `Failed to fetch` for the sample CID through `ipfs.io`; separate HTTP requests to `ipfs.io`, `trustless-gateway.link`, and `dweb.link` returned 403. The sample is supplied locally and its ongoing public pinning is not promised. Mocked gateway tests are not evidence of a working live gateway.
- No registry has been deployed to Hedera testnet and no testnet transaction proof is available yet. The deployment script passed a syntax check only. A dedicated testnet address was generated; the official faucet presents a human-verification challenge, so funding has not been completed.
- Wallet connection, transaction approval, live recording/revocation and browser reads of an actual deployed registry remain untested.
- Public-repository installation through `create-scaffold-hbar`, followed by a clean install/lint/build and route check, remains pending. A local repository build does not cover that path.
- Contest registration, final submission, and the developer-experience survey have not been submitted.

Record actual public transaction hashes and verification links here only after they exist. Keep testnet private keys and account credentials outside the repository.
