/**
 * XMSS-lite parameters. Every constant here has a twin in contracts/XmssVerifier.sol;
 * change both or neither.
 *
 * WOTS+ with n = 32 bytes, w = 16, keccak256 as the tweakable hash:
 *   len1 = 256 / log2(w) = 64 message digits
 *   len2 = floor(log2(len1 * (w - 1)) / log2(w)) + 1 = 3 checksum digits
 *   len  = 67 hash chains
 */
export const N = 32;
export const W = 16;
export const LOG_W = 4;
export const LEN1 = 64;
export const LEN2 = 3;
export const LEN = LEN1 + LEN2;
export const CHAIN_MAX = W - 1; // 15 steps from secret to public

/** Default tree height: 2^10 = 1,024 one-time keys per root. */
export const DEFAULT_HEIGHT = 10;

/** Signature layout: leaf index (4 bytes, big-endian) ‖ 67 chain values ‖ h auth-path nodes. */
export const LEAF_INDEX_BYTES = 4;
export const sigLength = (height: number) => LEAF_INDEX_BYTES + LEN * N + height * N;

/** Domain tags, mixed into the 32-byte address word of every hash (top byte). */
export const TAG_CHAIN = 0x01;
export const TAG_LEAF = 0x02;
export const TAG_NODE = 0x03;
export const TAG_MSG = 0x04;
