// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

interface IConduitController {
  function getConduitCodeHashes()
    external
    view
    returns (bytes32 creationCodeHash, bytes32 runtimeCodeHash);
}

interface IConduit {
  enum ConduitItemType {
    NATIVE, // Unused
    ERC20,
    ERC721,
    ERC1155
  }

  struct ConduitTransfer {
    ConduitItemType itemType;
    address token;
    address from;
    address to;
    uint256 identifier;
    uint256 amount;
  }

  function execute(ConduitTransfer[] calldata transfers) external returns (bytes4 magicValue);
}
