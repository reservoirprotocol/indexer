// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

interface ISudoswapPairV2 {
  enum PairVariant {
    ERC721_ETH,
    ERC721_ERC20,
    ERC1155_ETH,
    ERC1155_ERC20
  }

  function nft() external returns (address);

  function nftId() external returns (uint256 id);

  function token() external returns (IERC20);

  function pairVariant() external pure returns (PairVariant);

  function getBuyNFTQuote(
    uint256 assetId,
    uint256 numNFTs
  )
    external
    view
    returns (
      uint8 error,
      uint256 newSpotPrice,
      uint256 newDelta,
      uint256 inputAmount,
      uint256 protocolFee,
      uint256 royaltyAmount
    );

  function swapTokenForSpecificNFTs(
    uint256[] calldata nftIds,
    uint256 maxExpectedTokenInput,
    address nftRecipient,
    bool isRouter,
    address routerCaller
  ) external payable returns (uint256);

  function swapNFTsForToken(
    uint256[] calldata nftIds,
    uint256 minExpectedTokenOutput,
    address payable tokenRecipient,
    bool isRouter,
    address routerCaller
  ) external returns (uint256 outputAmount);
}
