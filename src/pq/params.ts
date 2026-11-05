/**
 * XMSS-lite parameters. Every constant here has a twin in contracts/XmssVerifier.sol;
 * change both or neither.
 *
 * One-time signatures are WOTS+C (Winternitz with a target-sum constraint instead of a
 * checksum, as in SPHINCS+C / SPHINCS⁻): the signer grinds a counter until the message's
 * base-w digits sum to exactly TARGET_SUM. Any other message with the same digit sum has
 * some digit lower than the signed one, and reaching it means inverting a hash chain, so no
 * checksum chains are needed. A high TARGET_SUM makes verification cheap and fixed-cost:
 * the verifier walks exactly LEN × (W − 1) − TARGET_SUM chain steps.
 *
 *   n = 32 bytes, keccak256 tweakable hash
 *   w = 4 → 128 base-4 digits of a 256-bit digest, chains of length 3
 *   digit sum: mean 192, σ ≈ 12.6; TARGET_SUM = 240 (+3.8σ)
 *     → verifier steps = 384 − 240 = 144; P(sum = 240) ≈ 2.4e-5, so the signer grinds
 *       ~4 × 10^4 counters on average (well under a second)
 *   security cost of the constraint: −log2 P ≈ 15 bits off the 256-bit message space
 *   (still far above the 128-bit post-quantum target)
 */
export const N = 32;
export const W = 4;
export const LOG_W = 2;
export const LEN = 128;
export const CHAIN_MAX = W - 1; // 3 steps from secret to public
export const TARGET_SUM = 240;
export const VERIFY_STEPS = LEN * CHAIN_MAX - TARGET_SUM; // 144

/** Default tree height: 2^10 = 1,024 one-time keys per root. */
export const DEFAULT_HEIGHT = 10;

/** Signature layout: leaf (4 B) ‖ counter (4 B) ‖ 128 chain values ‖ h auth-path nodes. */
export const LEAF_INDEX_BYTES = 4;
export const COUNTER_BYTES = 4;
export const HEADER_BYTES = LEAF_INDEX_BYTES + COUNTER_BYTES;
export const sigLength = (height: number) => HEADER_BYTES + LEN * N + height * N;

/** Domain tags, mixed into the 32-byte address word of every hash (top byte). */
export const TAG_CHAIN = 0x01;
export const TAG_LEAF = 0x02;
export const TAG_NODE = 0x03;
export const TAG_MSG = 0x04;
