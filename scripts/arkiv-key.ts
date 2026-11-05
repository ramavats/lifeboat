/**
 * The Arkiv publisher key for the migration log, kept in .env (gitignored).
 * Created on first use; fund its address with testnet tGLM at https://hub.arkiv.network/faucet.
 */
import { appendFileSync, existsSync } from "node:fs";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import type { Hex } from "viem";

const ENV = new URL("../.env", import.meta.url);

export function arkivKey(): { privateKey: Hex; address: Hex } {
  if (existsSync(ENV)) process.loadEnvFile(ENV);
  let pk = process.env.ARKIV_PRIVATE_KEY as Hex | undefined;
  if (!pk) {
    pk = generatePrivateKey();
    appendFileSync(ENV, `ARKIV_PRIVATE_KEY=${pk}\n`);
    process.env.ARKIV_PRIVATE_KEY = pk;
  }
  return { privateKey: pk, address: privateKeyToAccount(pk).address };
}

if (process.argv[1]?.endsWith("arkiv-key.ts")) {
  const { address } = arkivKey();
  console.log(`Arkiv publisher address: ${address}`);
  console.log("Fund it with testnet tGLM: https://hub.arkiv.network/faucet");
  console.log("Optional: put ARKIV_ACCESS_KEY=... in .env (https://hub.arkiv.network/access-keys)");
}
