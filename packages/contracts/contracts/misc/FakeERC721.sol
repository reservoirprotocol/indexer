// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

// Fake ERC721 which supports the standard transfer interface but does nothing
contract FakeERC721 {
  function safeTransferFrom(
    address, // from
    address, // to
    uint256 // tokenId
  ) public {}
}
