// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {LifeboatAccount} from "./LifeboatAccount.sol";

/// Creates Lifeboat accounts and remembers which addresses are genuine ones, so a
/// migration sponsor can check that funds only ever move into a real quantum-safe account.
contract LifeboatFactory {
    mapping(address => bool) public isLifeboat;

    event Created(address indexed account, address indexed owner, bytes32 root, uint256 height);

    function create(address owner, bytes32 pubSeed, bytes32 root, uint256 height)
        external
        payable
        returns (address account)
    {
        // Accounts fit the 100k unstaked validation budget, so they are created without stake.
        account = address(new LifeboatAccount{value: msg.value}(owner, pubSeed, root, height, address(0), 0, 0));
        isLifeboat[account] = true;
        emit Created(account, owner, root, height);
    }
}
