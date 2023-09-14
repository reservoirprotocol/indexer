// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

interface ISuperRare {
  function buy(
    IERC721 nftContract,
    uint256 tokenId,
    address currency,
    uint256 price
  ) external payable;
}
