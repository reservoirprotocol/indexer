// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

contract MockERC721 is ERC721 {
  uint256 public nextTokenId;
  bool public locked;

  constructor() ERC721("Mock", "MOCK") {
    locked = false;
  }

  function lock() external {
    locked = true;
  }

  function mint(uint256 tokenId) external {
    _safeMint(msg.sender, tokenId);
  }

  function mintWithPrice(uint256 price) external payable {
    require(msg.value == price, "Insufficient value");
    _safeMint(msg.sender, nextTokenId++);
  }

  function _transfer(
    address from,
    address to,
    uint256 tokenId
  ) internal override {
    if (locked) revert();
    super._transfer(from, to, tokenId);
  }

  function fail() external pure {
    revert();
  }
}
