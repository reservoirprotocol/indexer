// SPDX-License-Identifier: MIT

pragma solidity ^0.8.1;

// Based on https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/metatx/ERC2771Context.sol
abstract contract ERC2771Context {
  address private immutable _trustedForwarder;

  constructor(address trustedForwarder) {
    _trustedForwarder = trustedForwarder;
  }

  function isTrustedForwarder(address forwarder) public view virtual returns (bool) {
    return forwarder == _trustedForwarder;
  }

  function _msgSender() internal view virtual returns (address sender) {
    if (isTrustedForwarder(msg.sender)) {
      // The assembly code is more direct than the Solidity version using `abi.decode`
      assembly {
        sender := shr(96, calldataload(sub(calldatasize(), 20)))
      }
    } else {
      return msg.sender;
    }
  }

  function _msgData() internal view virtual returns (bytes calldata) {
    if (isTrustedForwarder(msg.sender)) {
      return msg.data[:msg.data.length - 20];
    } else {
      return msg.data;
    }
  }
}
