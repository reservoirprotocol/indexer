// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";

contract MockERC1155 is ERC1155 {
  uint256 public nextTokenId;
  bool public locked;
  
  constructor() ERC1155("https://mock.com") {
    locked = false;
  }

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

  function lock() external {
    locked = true;
  }

  function _beforeTokenTransfer(
      address operator,
      address from,
      address to,
      uint256[] memory ids,
      uint256[] memory amounts,
      bytes memory data
  ) internal override {
    if (locked) revert();
  }

  function fail() external pure {
    revert();
  }
}
