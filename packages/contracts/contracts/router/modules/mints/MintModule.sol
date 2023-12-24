// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";

import {MintProxy} from "./MintProxy.sol";

contract MintModule {
  // --- Errors ---

  error UnsuccessfulCall();

  // --- Fields ---

  address public implementation;
  mapping(address => address) public proxies;

  // --- Constructor ---

  constructor() {
    implementation = address(new MintProxy());
  }

  // --- Methods ---

  function mint(address minter, bytes calldata data) external payable {
    address proxy = proxies[minter];
    if (proxy == address(0)) {
      proxy = Clones.cloneDeterministic(implementation, bytes32(uint256(uint160(minter))));
      MintProxy(proxy).initialize(minter);

      proxies[minter] = proxy;
    }

    (bool result, ) = proxy.call{value: msg.value}(data);
    if (!result) {
      revert UnsuccessfulCall();
    }
  }
}
