import { defineConfig } from "vitest/config";

// Signing grinds ~4 × 10^4 hashes and keygen walks thousands of chains: allow for it.
export default defineConfig({ test: { testTimeout: 60_000, hookTimeout: 120_000 } });
