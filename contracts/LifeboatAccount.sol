// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {HegotaSupport} from "@forshtat/hegota-support/contracts/HegotaSupport.sol";
import {Devnet} from "@forshtat/hegota-support/contracts/Devnet.sol";
import {Scope, SigParam, TxParam} from "@forshtat/hegota-support/contracts/Params.sol";
import {XmssVerifier} from "./XmssVerifier.sol";

interface IStakingRegistry {
    function addStake(uint32 unstakeDelaySec) external payable;
}

/// A quantum-safe EIP-8141 account.
///
/// Every transaction must carry an XMSS-lite signature (hash-based, quantum-safe) over the
/// canonical signature hash, as an ARBITRARY signature entry (index 1 in HYBRID, 0 in PQ_ONLY). The one-time
/// key it uses must be the key for this transaction's nonce, so no key is ever accepted twice.
///
/// In HYBRID mode the owner's secp256k1 signature (entry 0, checked by the protocol) is required
/// too: the account is never weaker than the ECDSA wallet it replaced. PQ_ONLY drops ECDSA for
/// good, for the day ECDSA keys can be derived from public keys.
///
/// Frame layout: [VERIFY(self, data = validateTx()), SENDER(self, data = execute / executeBatch / ...)]
contract LifeboatAccount is HegotaSupport(Devnet.ERC8421_WORKSHOP) {
    enum Mode {
        HYBRID,
        PQ_ONLY
    }

    struct Call {
        address to;
        uint256 value;
        bytes data;
    }

    /// HYBRID: [0] secp256k1 from the owner, [1] PQ. PQ_ONLY: [0] PQ.
    uint256 internal constant ECDSA_SIG_INDEX = 0;
    uint256 internal constant SCHEME_ARBITRARY = 0;
    uint256 internal constant SCHEME_SECP256K1 = 1;

    address public immutable owner;

    // Packed into one slot: VERIFY reads it on every tx, and each cold slot costs 2,100 gas
    // of a 100k validation budget.
    Mode public mode;
    uint32 public height;
    /// Leaf index = tx nonce - nonceBase. 0 at deploy (a contract's nonce starts above 0 and
    /// the helper deployments raise it, so the first few leaves simply go unused); reset on rotation.
    uint64 public nonceBase;
    bytes32 public pubSeed;
    bytes32 public root;

    event ModeChanged(Mode mode);
    event KeysRotated(bytes32 pubSeed, bytes32 root, uint256 height, uint256 nonceBase);

    error NotSelf();
    error BadSignatureEntry();
    error BadPqSignature();
    error WrongOneTimeKey(uint256 expected, uint256 got);
    error BadOwnerSignature();
    error CallFailed(uint256 index, bytes reason);

    /// @param stakeValue part of msg.value staked for this account, so the alt mempool admits its
    ///        validation (which costs more than the 100k unstaked budget). The rest stays as balance.
    constructor(
        address owner_,
        bytes32 pubSeed_,
        bytes32 root_,
        uint256 height_,
        address stakingRegistry,
        uint256 stakeValue,
        uint32 unstakeDelaySec
    ) payable {
        owner = owner_;
        pubSeed = pubSeed_;
        root = root_;
        height = uint32(height_);
        if (stakeValue > 0) IStakingRegistry(stakingRegistry).addStake{value: stakeValue}(unstakeDelaySec);
        emit KeysRotated(pubSeed_, root_, height_, 0);
    }

    receive() external payable {}

    // ------------------------------------------------------------------ validation (VERIFY frame)

    /// Reads only this account's own storage, so it is valid validation code for the mempool.
    function validateTx() external {
        Mode m = mode;
        uint256 h = height;
        uint256 pqIndex = m == Mode.HYBRID ? 1 : 0;
        if (sigparam(pqIndex, SigParam.SCHEME) != SCHEME_ARBITRARY) revert BadSignatureEntry();
        uint256 len = XmssVerifier.sigLength(h);
        if (sigparam(pqIndex, SigParam.SIGNATURE_LENGTH) != len) revert BadPqSignature();
        bytes memory sig = sigdatacopy(0, len, pqIndex);
        bytes32 sigHash = bytes32(txparam(TxParam.SIG_HASH));

        (bool ok, uint256 leaf) = XmssVerifier.verify(pubSeed, root, h, sigHash, sig);
        if (!ok) revert BadPqSignature();
        uint256 expected = txparam(TxParam.NONCE) - nonceBase;
        if (leaf != expected) revert WrongOneTimeKey(expected, leaf);

        if (m == Mode.HYBRID) {
            if (sigparam(ECDSA_SIG_INDEX, SigParam.SCHEME) != SCHEME_SECP256K1) revert BadOwnerSignature();
            if (address(uint160(sigparam(ECDSA_SIG_INDEX, SigParam.RESOLVED_SIGNER))) != owner) {
                revert BadOwnerSignature();
            }
        }
        approve(Scope.EXECUTION_AND_PAYMENT);
    }

    // ------------------------------------------------------------------ execution (SENDER frame)

    modifier onlySelf() {
        if (msg.sender != address(this)) revert NotSelf();
        _;
    }

    function execute(address to, uint256 value, bytes calldata data) external onlySelf {
        (bool ok, bytes memory ret) = to.call{value: value}(data);
        if (!ok) revert CallFailed(0, ret);
    }

    function executeBatch(Call[] calldata calls) external onlySelf {
        for (uint256 i = 0; i < calls.length; i++) {
            (bool ok, bytes memory ret) = calls[i].to.call{value: calls[i].value}(calls[i].data);
            if (!ok) revert CallFailed(i, ret);
        }
    }

    /// One way: after this, ECDSA signatures are ignored and only the quantum-safe key counts.
    function enablePqOnly() external onlySelf {
        mode = Mode.PQ_ONLY;
        emit ModeChanged(Mode.PQ_ONLY);
    }

    /// Move to a fresh key tree before the current one runs out. Authorized by a PQ signature
    /// from the current tree (every transaction is).
    function rotateKeys(bytes32 newPubSeed, bytes32 newRoot, uint256 newHeight) external onlySelf {
        pubSeed = newPubSeed;
        root = newRoot;
        height = uint32(newHeight);
        // This tx consumed nonce N; the next tx (nonce N + 1) uses leaf 0 of the new tree.
        nonceBase = uint64(txparam(TxParam.NONCE) + 1);
        emit KeysRotated(newPubSeed, newRoot, newHeight, nonceBase);
    }
}
