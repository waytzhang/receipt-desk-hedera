import { readFile, mkdir, writeFile } from "node:fs/promises";
import { ContractFactory, JsonRpcProvider, Wallet, keccak256 } from "ethers";

if (!process.argv.includes("--confirm-testnet")) {
  throw new Error("Pass --confirm-testnet to deploy using valueless Hedera testnet HBAR.");
}
const key = process.env.HEDERA_TESTNET_PRIVATE_KEY;
if (!key || !/^(0x)?[0-9a-fA-F]{64}$/.test(key)) throw new Error("Set a valid HEDERA_TESTNET_PRIVATE_KEY in the process environment.");
const provider = new JsonRpcProvider("https://testnet.hashio.io/api");
try {
  if ((await provider.getNetwork()).chainId !== 296n) throw new Error("Refusing deployment: chain ID is not Hedera testnet 296.");
  const wallet = new Wallet(key, provider);
  if ((await provider.getBalance(wallet.address)) === 0n) throw new Error("Fund this testnet account from the official faucet first.");
  const artifact = JSON.parse(await readFile(new URL("../out/ContentReceipts.sol/ContentReceipts.json", import.meta.url), "utf8"));
  const contract = await new ContractFactory(artifact.abi, artifact.bytecode.object, wallet).deploy({ chainId: 296 });
  const transaction = contract.deploymentTransaction();
  const receipt = await transaction.wait();
  if (!receipt || receipt.status !== 1) throw new Error("Deployment did not succeed.");
  const address = await contract.getAddress();
  const code = await provider.getCode(address);
  if (code === "0x") throw new Error("Deployment mined but no runtime code was returned.");
  const result = { network: "hedera-testnet", chainId: 296, address, deployer: wallet.address, transactionHash: transaction.hash, blockNumber: receipt.blockNumber, runtimeCodeHash: keccak256(code), hashscan: `https://hashscan.io/testnet/transaction/${transaction.hash}` };
  const directory = new URL("../deployments/", import.meta.url);
  await mkdir(directory, { recursive: true });
  await writeFile(new URL("testnet.json", directory), `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error("Testnet deployment failed:", error?.shortMessage || "Check connectivity, compiler output, and faucet balance; no private key is logged.");
  process.exitCode = 1;
} finally { provider.destroy(); }
