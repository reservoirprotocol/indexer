// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

contract MockERC721 is ERC721 {
  uint256 public nextTokenId;

  constructor() ERC721("Mock", "MOCK") {}

  function mint(uint256 tokenId) external {
    _safeMint(msg.sender, tokenId);
  }

  function mintWithPrice(uint256 price) external payable {
    require(msg.value == price, "Insufficient value");
    _safeMint(msg.sender, nextTokenId++);
  }

  function fail() external pure {
    revert();
  }
}
