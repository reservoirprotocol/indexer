// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@limitbreak/creator-token-contracts/contracts/erc721c/ERC721C.sol";
import "@limitbreak/creator-token-contracts/contracts/access/OwnableBasic.sol";

abstract contract ERC721CMetadata is 
    OwnableBasic, 
    ERC721C {
    constructor(string memory name_, string memory symbol_)
    ERC721OpenZeppelin(name_, symbol_) {}
}

contract MockERC721C is ERC721CMetadata {
  uint256 public nextTokenId;

  constructor() ERC721CMetadata("MyCollection", "MC") {}

  function mint(uint256 tokenId) external {
    _safeMint(msg.sender, tokenId);
  }

  function mintWithPrice(uint256 price) external payable {
    require(msg.value == price, "Insufficient value");
    _safeMint(msg.sender, nextTokenId++);
  }
}