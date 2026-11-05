/// <reference lib="webworker" />
import { keygen } from "../../src/pq/xmss.js";

/**
 * Key generation runs here, off the main thread: 2^10 one-time keys is ~1.3M hashes.
 * The worker sends progress, then the whole key tree back. Nothing leaves the browser.
 */
self.onmessage = (e: MessageEvent<{ seed: Uint8Array; height: number }>) => {
  const { seed, height } = e.data;
  const total = 1 << height;
  const kp = keygen(seed, height, (done) => self.postMessage({ type: "progress", done, total }));
  self.postMessage({ type: "done", kp });
};
