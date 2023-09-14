// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

interface ICollectionPool {
  enum PoolType {
    TOKEN,
    NFT,
    TRADE
  }

  enum PoolVariant {
    ENUMERABLE_ETH,
    MISSING_ENUMERABLE_ETH,
    ENUMERABLE_ERC20,
    MISSING_ENUMERABLE_ERC20
  }

  struct CurveParams {
    uint128 spotPrice;
    uint128 delta;
    bytes props;
    bytes state;
  }

  struct CurveFees {
    uint256 trade;
    uint256 protocol;
    uint256[] royalties;
  }

  function nft() external returns (IERC721);

  function token() external returns (IERC20);

  function poolType() external view returns (PoolType);

  function poolVariant() external pure returns (PoolVariant);

  function externalFilter() external view returns (address);

  function getBuyNFTQuote(
    uint256 numNFTs
  )
    external
    view
    returns (
      CurveParams memory newParams,
      uint256 totalAmount,
      uint256 inputAmount,
      CurveFees memory fees
    );
}

interface ICollectionRouter {
  struct PoolSwapSpecific {
    ICollectionPool pool;
    uint256[] nftIds;
    bytes32[] proof;
    bool[] proofFlags;
    /// @dev only used for selling into pools
    bytes externalFilterContext;
  }

  function swapETHForSpecificNFTs(
    PoolSwapSpecific[] calldata swapList,
    address ethRecipient,
    address nftRecipient,
    uint256 deadline
  ) external payable returns (uint256 remainingValue);

  function swapERC20ForSpecificNFTs(
    PoolSwapSpecific[] calldata swapList,
    uint256 inputAmount,
    address nftRecipient,
    uint256 deadline
  ) external returns (uint256 remainingValue);

  function swapNFTsForToken(
    PoolSwapSpecific[] calldata swapList,
    uint256 minOutput,
    address tokenRecipient,
    uint256 deadline
  ) external returns (uint256 outputAmount);
}
