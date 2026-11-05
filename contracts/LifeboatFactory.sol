// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {LifeboatAccount} from "./LifeboatAccount.sol";

/// Creates Lifeboat accounts at predictable addresses and remembers which addresses are
/// genuine, so a migration sponsor can check where funds go, even for an account that the
/// migration transaction itself is about to create.
contract LifeboatFactory {
    /// keccak256 of the account's init code. Accounts take no constructor arguments, so it is
    /// the same for all of them and predict() is a single hash.
    bytes32 public immutable INIT_HASH = keccak256(type(LifeboatAccount).creationCode);

    mapping(address => bool) public isLifeboat;

    event Created(address indexed account, address indexed owner, bytes32 root, uint256 height);

    function salt(address owner, bytes32 pubSeed, bytes32 root, uint256 height) public pure returns (bytes32) {
        return keccak256(abi.encode(owner, pubSeed, root, height));
    }

    /// The address create() will deploy to for these keys. Reads no storage.
    function predict(address owner, bytes32 pubSeed, bytes32 root, uint256 height) public view returns (address) {
        bytes32 h = keccak256(abi.encodePacked(bytes1(0xff), address(this), salt(owner, pubSeed, root, height), INIT_HASH));
        return address(uint160(uint256(h)));
    }

    /// Deploy and initialise in one call. Idempotent: if the account exists it is returned
    /// (with any value forwarded), so nobody can make a migration fail by creating its account
    /// first. Anyone may call it, but the account always belongs to `owner` with these keys.
    function create(address owner, bytes32 pubSeed, bytes32 root, uint256 height) external payable returns (address account) {
        account = predict(owner, pubSeed, root, height);
        if (isLifeboat[account]) {
            if (msg.value > 0) payable(account).transfer(msg.value);
            return account;
        }
        account = address(new LifeboatAccount{salt: salt(owner, pubSeed, root, height), value: msg.value}());
        LifeboatAccount(payable(account)).init(owner, pubSeed, root, height);
        isLifeboat[account] = true;
        emit Created(account, owner, root, height);
    }
}
