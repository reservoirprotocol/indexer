// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

interface ISudoswapPair {
  enum PairVariant {
    ENUMERABLE_ETH,
    MISSING_ENUMERABLE_ETH,
    ENUMERABLE_ERC20,
    MISSING_ENUMERABLE_ERC20
  }

  function nft() external returns (IERC721);

  function token() external returns (IERC20);

  function pairVariant() external pure returns (PairVariant);

  function getBuyNFTQuote(uint256 numNFTs)
    external
    view
    returns (
      uint8 error,
      uint256 newSpotPrice,
      uint256 newDelta,
      uint256 inputAmount,
      uint256 protocolFee
    );
}

interface ISudoswapRouter {
  struct PairSwapSpecific {
    ISudoswapPair pair;
    uint256[] nftIds;
  }

  function swapETHForSpecificNFTs(
    PairSwapSpecific[] calldata swapList,
    address ethRecipient,
    address nftRecipient,
    uint256 deadline
  ) external payable returns (uint256 remainingValue);

  function swapERC20ForSpecificNFTs(
    PairSwapSpecific[] calldata swapList,
    uint256 inputAmount,
    address nftRecipient,
    uint256 deadline
  ) external returns (uint256 remainingValue);

  function swapNFTsForToken(
    PairSwapSpecific[] calldata swapList,
    uint256 minOutput,
    address tokenRecipient,
    uint256 deadline
  ) external returns (uint256 outputAmount);
}
