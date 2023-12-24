// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

interface IMidasRouter {
  function getMinAmountIn(
    address pair,
    uint256[] calldata tokenIds
  ) external view returns (uint128 totalAmount);
}

interface IMidasPair {
  function sellNFT(uint256 nftId, address to) external returns (uint128 amountOut);

  function buyNFT(uint256 nftId, address to) external;
}

interface IMidasFactory {
  function getPairERC721(address tokenA, address tokenB) external view returns (address pair);
}
