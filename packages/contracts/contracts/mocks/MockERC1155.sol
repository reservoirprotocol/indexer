// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";

contract MockERC1155 is ERC1155 {
  uint256 public nextTokenId;

  constructor() ERC1155("https://mock.com") {}

  function mint(uint256 tokenId) external {
    _mint(msg.sender, tokenId, 1, "");
  }

  function mintMany(uint256 tokenId, uint256 amount) external {
    _mint(msg.sender, tokenId, amount, "");
  }

  function mintWithPrice(uint256 amount, uint256 price) external payable {
    require(msg.value == price * amount, "Insufficient value");
    _mint(msg.sender, nextTokenId++, amount, "");
  }

  function fail() external pure {
    revert();
  }
}
