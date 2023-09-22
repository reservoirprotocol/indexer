// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@limitbreak/creator-token-contracts/contracts/access/OwnableBasic.sol";
import "@limitbreak/creator-token-contracts/contracts/erc721c/ERC721C.sol";

contract MockERC721C is OwnableBasic, ERC721C {
  uint256 public nextTokenId;

  constructor() ERC721OpenZeppelin("Mock", "MOCK") {}

  function mint(uint256 tokenId) external {
    _safeMint(msg.sender, tokenId);
  }

  function mintWithPrice(uint256 price) external payable {
    require(msg.value == price, "Insufficient value");
    _safeMint(msg.sender, nextTokenId++);
  }
}
