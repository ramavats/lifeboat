/** List the public migration log: pnpm arkiv [<lifeboat address>] */
import { readMigrations } from "../src/arkiv/log.js";
import { arkivKey } from "./arkiv-key.js";
import type { Address } from "viem";

const publisher = (process.env.LIFEBOAT_PUBLISHER as Address | undefined) ?? arkivKey().address;
const rows = await readMigrations(publisher, { lifeboat: process.argv[2] as Address | undefined });
console.log(`${rows.length} migration(s) listed by ${publisher}`);
for (const r of rows) console.log(`  block ${r.block}  ${r.exposed} → ${r.lifeboat}  ${r.assets}  sponsored=${r.sponsored}  ${r.txHash}`);
