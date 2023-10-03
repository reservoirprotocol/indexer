// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

import {BaseExchangeModule} from "./BaseExchangeModule.sol";
import {BaseModule} from "../BaseModule.sol";

import {IDittoPool} from "../../../interfaces/IDittoPool.sol";

struct DittoOrderParams {
  address tokenSender;
  uint256[] nftIds;
  bytes swapData;
}

contract DittoModule is BaseExchangeModule {
  using SafeERC20 for IERC20;

  // --- Constructor ---

  constructor(address owner, address router) BaseModule(owner) BaseExchangeModule(router) {}

  // --- Helper methods ---

  function poolTransferNftFrom(IERC721 token, address from, address to, uint256 tokenId) external {
    token.transferFrom(from, to, tokenId);
  }

  function poolTransferErc20From(
    IERC20 token,
    address from,
    address to,
    uint256 amount
  ) external virtual {
    if (from == address(this)) {
      token.safeTransfer(to, amount);
    } else {
      token.safeTransferFrom(from, to, amount);
    }
  }

  // --- Multiple ERC20 listing ---

  function buyWithERC20(
    IDittoPool[] calldata pairs,
    DittoOrderParams[] calldata orderParams,
    ERC20ListingParams calldata params,
    Fee[] calldata fees
  )
    external
    nonReentrant
    refundERC20Leftover(params.refundTo, params.token)
    chargeERC20Fees(fees, params.token, params.amount)
  {
    uint256 pairsLength = pairs.length;
    for (uint256 i; i < pairsLength; ) {
      // Execute fill
      IDittoPool.SwapTokensForNftsArgs memory args = IDittoPool.SwapTokensForNftsArgs({
        nftIds: orderParams[i].nftIds,
        maxExpectedTokenInput: params.amount,
        tokenSender: orderParams[i].tokenSender,
        nftRecipient: params.fillTo,
        swapData: orderParams[i].swapData
      });

      pairs[i].swapTokensForNfts(args);

      unchecked {
        ++i;
      }
    }
  }

  // --- Single ERC721 offer ---

  function sell(
    IDittoPool pool,
    DittoOrderParams calldata orderParams,
    uint256[] calldata lpIds,
    bytes calldata permitterData,
    uint256 minOutput,
    OfferParams calldata params,
    Fee[] calldata fees
  ) external nonReentrant {
    IERC20 token = pool.token();

    IDittoPool.SwapNftsForTokensArgs memory args = IDittoPool.SwapNftsForTokensArgs({
      nftIds: orderParams.nftIds,
      lpIds: lpIds,
      minExpectedTokenOutput: minOutput,
      nftSender: orderParams.tokenSender,
      tokenRecipient: params.fillTo,
      permitterData: permitterData,
      swapData: orderParams.swapData
    });

    pool.swapNftsForTokens(args);

    // Pay fees
    uint256 feesLength = fees.length;
    for (uint256 i; i < feesLength; ) {
      Fee memory fee = fees[i];
      _sendERC20(fee.recipient, fee.amount, token);

      unchecked {
        ++i;
      }
    }
  }
}
