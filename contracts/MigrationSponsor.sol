// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {HegotaSupport} from "@forshtat/hegota-support/contracts/HegotaSupport.sol";
import {Devnet} from "@forshtat/hegota-support/contracts/Devnet.sol";
import {Scope, TxParam, FrameParam, FrameMode} from "@forshtat/hegota-support/contracts/Params.sol";
import {LifeboatFactory} from "./LifeboatFactory.sol";

interface IStakingRegistry {
    function addStake(uint32 unstakeDelaySec) external payable;
}

/// Pays the gas for one migration per exposed account: a transaction that does nothing but
/// move the sender's assets into a genuine Lifeboat account.
///
/// Expected frame layout (sender = the exposed EOA):
///   [0] VERIFY  scope EXECUTION, target sender           the EOA's own ECDSA approval
///   [1] VERIFY  scope PAYMENT,   target this, data = sponsor(lifeboat)
///   [2..k-1] SENDER, atomic batch:
///         target == lifeboat, data empty               (ETH, any value)
///      or target == token, value 0, data = transfer(lifeboat, amount)
///   [k] DEFAULT target this, data = recordSponsorship()  marks the sender as sponsored
///
/// Validation reads LifeboatFactory.isLifeboat, storage of another contract. ERC-8421 lets a
/// staked entity do that; the public mempool does not. That is why this sponsor exists only
/// in the alt mempool, and why its constructor stakes it.
contract MigrationSponsor is HegotaSupport(Devnet.ERC8421_WORKSHOP) {
    address internal constant ENTRY_POINT = 0x00000000000000000000000000000000000000AA;
    bytes4 internal constant TRANSFER = 0xa9059cbb; // transfer(address,uint256)
    uint256 internal constant MAX_SENDER_FRAMES = 8;
    /// Upper bound on the execution gas a sponsored migration may declare (all frames).
    uint256 public constant MAX_SPONSORED_GAS = 1_500_000;

    LifeboatFactory public immutable factory;
    mapping(address => bool) public sponsored;

    event Sponsored(address indexed exposed, address indexed lifeboat);

    error NotEntryPoint();
    error NotALifeboat();
    error AlreadySponsored();
    error NotExposed();
    error BadLayout(uint256 frame);
    error NotAMigration(uint256 frame);
    error TooMuchGas();

    constructor(LifeboatFactory factory_, address stakingRegistry, uint256 stakeValue, uint32 unstakeDelaySec)
        payable
    {
        factory = factory_;
        if (stakeValue > 0) IStakingRegistry(stakingRegistry).addStake{value: stakeValue}(unstakeDelaySec);
    }

    /// VERIFY(PAYMENT) entry. Approves paying only for a well-formed migration.
    function sponsor(address lifeboat) external {
        address exposed = address(uint160(txparam(TxParam.SENDER)));
        if (sponsored[exposed]) revert AlreadySponsored();
        // A nonce above 0 means the account has signed before: its public key is onchain.
        if (txparam(TxParam.NONCE) == 0) revert NotExposed();
        if (!factory.isLifeboat(lifeboat)) revert NotALifeboat();

        uint256 count = txparam(TxParam.FRAME_COUNT);
        if (count < 4 || count > 3 + MAX_SENDER_FRAMES) revert BadLayout(count);

        uint256 gasSum = frameparam(0, FrameParam.EXECUTION_GAS_LIMIT) + frameparam(1, FrameParam.EXECUTION_GAS_LIMIT);
        for (uint256 i = 2; i < count - 1; i++) {
            if (frameparam(i, FrameParam.MODE) != uint256(FrameMode.SENDER)) revert BadLayout(i);
            address target = address(uint160(frameparam(i, FrameParam.RESOLVED_TARGET)));
            uint256 len = frameparam(i, FrameParam.DATA_LENGTH);
            if (len == 0) {
                if (target != lifeboat) revert NotAMigration(i);
            } else {
                if (len != 68 || frameparam(i, FrameParam.VALUE) != 0) revert NotAMigration(i);
                bytes32 w0 = framedataload(0, i);
                if (bytes4(w0) != TRANSFER) revert NotAMigration(i);
                // The 32-byte word at offset 4 is the ABI-encoded recipient.
                address to = address(uint160(uint256(framedataload(4, i))));
                if (to != lifeboat) revert NotAMigration(i);
            }
            gasSum += frameparam(i, FrameParam.EXECUTION_GAS_LIMIT);
        }

        uint256 last = count - 1;
        if (frameparam(last, FrameParam.MODE) != uint256(FrameMode.DEFAULT)) revert BadLayout(last);
        if (address(uint160(frameparam(last, FrameParam.RESOLVED_TARGET))) != address(this)) revert BadLayout(last);
        if (bytes4(framedataload(0, last)) != this.recordSponsorship.selector) revert BadLayout(last);
        gasSum += frameparam(last, FrameParam.EXECUTION_GAS_LIMIT);
        if (gasSum > MAX_SPONSORED_GAS) revert TooMuchGas();

        approve(Scope.PAYMENT);
    }

    /// DEFAULT frame at the end of a sponsored migration: one sponsorship per exposed account.
    function recordSponsorship() external {
        if (msg.sender != ENTRY_POINT) revert NotEntryPoint();
        address exposed = address(uint160(txparam(TxParam.SENDER)));
        if (sponsored[exposed]) revert AlreadySponsored();
        sponsored[exposed] = true;
        emit Sponsored(exposed, address(0));
    }

    receive() external payable {}
}
