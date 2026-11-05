// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// XMSS-lite verification: WOTS+C one-time signatures (w = 4, n = 32, keccak256, target digit
/// sum instead of a checksum) under a Merkle tree. Mirrors src/pq/xmss.ts.
/// Pure: reads no storage, so it is safe inside a VERIFY frame.
///
/// Signature layout: leaf (uint32 BE) ‖ counter (uint32 BE) ‖ 128 × bytes32 chain values ‖ height × bytes32 path.
/// Every hash is keccak256(pubSeed ‖ adrs ‖ data), adrs = tag << 248 | a << 64 | b << 32 | c.
/// Verification walks exactly LEN × 3 − TARGET_SUM = 144 chain steps, whatever the message.
library XmssVerifier {
    uint256 internal constant LEN = 128;
    uint256 internal constant CHAIN_MAX = 3;
    uint256 internal constant TARGET_SUM = 240;
    uint256 internal constant HEADER = 8;
    uint256 internal constant TAG_CHAIN = 0x01;
    uint256 internal constant TAG_LEAF = 0x02;
    uint256 internal constant TAG_NODE = 0x03;
    uint256 internal constant TAG_MSG = 0x04;

    function sigLength(uint256 height) internal pure returns (uint256) {
        return HEADER + LEN * 32 + height * 32;
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
            let head := mload(sigData)
            leaf := shr(224, head)
            let counter := and(shr(192, head), 0xffffffff)

            // Scratch: chain buffer C (96 B), node buffer D (128 B), leaf buffer B (64 + 128 × 32 B).
            let c := mload(0x40)
            let d := add(c, 96)
            let b := add(d, 128)
            mstore(0x40, add(b, add(64, mul(LEN, 32))))

            if lt(leaf, shl(height, 1)) {
                // m = keccak(pubSeed ‖ adrs(TAG_MSG, leaf, 0, counter) ‖ sigHash)
                mstore(c, pubSeed)
                mstore(add(c, 32), or(or(shl(248, TAG_MSG), shl(64, leaf)), counter))
                mstore(add(c, 64), sigHash)
                let m := keccak256(c, 96)

                // Walk each chain from its digit to the top, summing digits as we go.
                let leafAdrs := or(shl(248, TAG_CHAIN), shl(64, leaf))
                let chains := add(sigData, HEADER)
                let sum := 0
                for { let i := 0 } lt(i, LEN) { i := add(i, 1) } {
                    let digit := and(shr(sub(254, shl(1, i)), m), 3)
                    sum := add(sum, digit)
                    let x := mload(add(chains, shl(5, i)))
                    let base := or(leafAdrs, shl(32, i))
                    for { let j := digit } lt(j, CHAIN_MAX) { j := add(j, 1) } {
                        mstore(add(c, 32), or(base, j))
                        mstore(add(c, 64), x)
                        x := keccak256(c, 96)
                    }
                    mstore(add(b, add(64, shl(5, i))), x)
                }

                if eq(sum, TARGET_SUM) {
                    // Leaf = keccak(pubSeed ‖ adrs(TAG_LEAF, leaf) ‖ pk)
                    mstore(b, pubSeed)
                    mstore(add(b, 32), or(shl(248, TAG_LEAF), shl(64, leaf)))
                    let node := keccak256(b, add(64, mul(LEN, 32)))

                    // Climb the tree with the auth path.
                    mstore(d, pubSeed)
                    let path := add(chains, mul(LEN, 32))
                    let idx := leaf
                    for { let z := 0 } lt(z, height) { z := add(z, 1) } {
                        let sib := mload(add(path, shl(5, z)))
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
