// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// XMSS-lite verification: WOTS+ (w = 16, n = 32, keccak256) under a Merkle tree.
/// Mirrors src/pq/xmss.ts. Pure: reads no storage, so it is safe inside a VERIFY frame.
///
/// Signature layout: leaf (uint32, big-endian) ‖ 67 × bytes32 chain values ‖ height × bytes32 auth path.
/// Every hash is keccak256(pubSeed ‖ adrs ‖ data), adrs = tag << 248 | a << 64 | b << 32 | c.
library XmssVerifier {
    uint256 internal constant LEN = 67;
    uint256 internal constant LEN1 = 64;
    uint256 internal constant CHAIN_MAX = 15;
    uint256 internal constant TAG_CHAIN = 0x01;
    uint256 internal constant TAG_LEAF = 0x02;
    uint256 internal constant TAG_NODE = 0x03;
    uint256 internal constant TAG_MSG = 0x04;

    function sigLength(uint256 height) internal pure returns (uint256) {
        return 4 + LEN * 32 + height * 32;
    }

    /// @return ok   true iff `sig` is a valid signature of `sigHash` under (pubSeed, root)
    /// @return leaf the one-time key index the signature used (meaningful only when ok)
    function verify(bytes32 pubSeed, bytes32 root, uint256 height, bytes32 sigHash, bytes memory sig)
        internal
        pure
        returns (bool ok, uint256 leaf)
    {
        if (height == 0 || height > 20 || sig.length != sigLength(height)) return (false, 0);

        assembly ("memory-safe") {
            let sigData := add(sig, 32)
            leaf := shr(224, mload(sigData))

            // Scratch: chain buffer C (96 B), node buffer D (128 B), leaf buffer B (64 + 67 × 32 B).
            let c := mload(0x40)
            let d := add(c, 96)
            let b := add(d, 128)
            mstore(0x40, add(b, add(64, mul(LEN, 32))))

            if lt(leaf, shl(height, 1)) {
                // Message digest: keccak(pubSeed ‖ adrs(TAG_MSG) ‖ sigHash)
                mstore(c, pubSeed)
                mstore(add(c, 32), shl(248, TAG_MSG))
                mstore(add(c, 64), sigHash)
                let m := keccak256(c, 96)

                // Checksum of the 64 message digits.
                let csum := 0
                for { let i := 0 } lt(i, LEN1) { i := add(i, 1) } {
                    csum := add(csum, sub(CHAIN_MAX, and(shr(sub(252, mul(4, i)), m), 0xf)))
                }

                // Walk each chain from its digit to the top; write the results into B.
                mstore(c, pubSeed)
                let leafAdrs := or(shl(248, TAG_CHAIN), shl(64, leaf))
                let chains := add(sigData, 4)
                for { let i := 0 } lt(i, LEN) { i := add(i, 1) } {
                    let digit
                    switch lt(i, LEN1)
                    case 1 { digit := and(shr(sub(252, mul(4, i)), m), 0xf) }
                    default { digit := and(shr(mul(4, sub(66, i)), csum), 0xf) }

                    let x := mload(add(chains, mul(32, i)))
                    let base := or(leafAdrs, shl(32, i))
                    for { let j := digit } lt(j, CHAIN_MAX) { j := add(j, 1) } {
                        mstore(add(c, 32), or(base, j))
                        mstore(add(c, 64), x)
                        x := keccak256(c, 96)
                    }
                    mstore(add(b, add(64, mul(32, i))), x)
                }

                // Leaf = keccak(pubSeed ‖ adrs(TAG_LEAF, leaf) ‖ pk)
                mstore(b, pubSeed)
                mstore(add(b, 32), or(shl(248, TAG_LEAF), shl(64, leaf)))
                let node := keccak256(b, add(64, mul(LEN, 32)))

                // Climb the tree with the auth path.
                mstore(d, pubSeed)
                let path := add(chains, mul(LEN, 32))
                let idx := leaf
                for { let z := 0 } lt(z, height) { z := add(z, 1) } {
                    let sib := mload(add(path, mul(32, z)))
                    mstore(add(d, 32), or(or(shl(248, TAG_NODE), shl(32, add(z, 1))), shr(1, idx)))
                    switch and(idx, 1)
                    case 0 {
                        mstore(add(d, 64), node)
                        mstore(add(d, 96), sib)
                    }
                    default {
                        mstore(add(d, 64), sib)
                        mstore(add(d, 96), node)
                    }
                    node := keccak256(d, 128)
                    idx := shr(1, idx)
                }
                ok := eq(node, root)
            }
        }
    }
}

/// Test and benchmarking harness. Not deployed on the devnet.
contract XmssVerifierHarness {
    function verify(bytes32 pubSeed, bytes32 root, uint256 height, bytes32 sigHash, bytes calldata sig)
        external
        pure
        returns (bool ok, uint256 leaf)
    {
        return XmssVerifier.verify(pubSeed, root, height, sigHash, sig);
    }
}
