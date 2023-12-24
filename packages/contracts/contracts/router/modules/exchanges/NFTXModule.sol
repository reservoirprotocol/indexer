// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC1155} from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";

import {BaseExchangeModule} from "./BaseExchangeModule.sol";
import {BaseModule} from "../BaseModule.sol";

import {INFTXMarketplaceZap} from "../../../interfaces/INFTX.sol";
import {INFTXVault} from "../../../interfaces/INFTXVault.sol";
import {INFTXVaultFactory} from "../../../interfaces/INFTXVaultFactory.sol";

contract NFTXModule is BaseExchangeModule {
  // --- Fields ---

  INFTXMarketplaceZap public immutable NFTX_MARKETPLACE;

  // --- Constructor ---

  constructor(
    address owner,
    address router,
    address nftxMarketplace
  ) BaseModule(owner) BaseExchangeModule(router) {
    NFTX_MARKETPLACE = INFTXMarketplaceZap(nftxMarketplace);
  }

  // --- Fallback ---

  receive() external payable {}

  // --- Multiple ETH listings ---

  function buyWithETH(
    INFTXMarketplaceZap.BuyOrder[] calldata orders,
    ETHListingParams calldata params,
    Fee[] calldata fees
  )
    external
    payable
    nonReentrant
    refundETHLeftover(params.refundTo)
    chargeETHFees(fees, params.amount)
  {
    uint256 length = orders.length;
    for (uint256 i = 0; i < length; ) {
      INFTXMarketplaceZap.BuyOrder memory order = orders[i];
      // Execute fill
      _buy(orders[i], params.fillTo, params.revertIfIncomplete, order.price);

      unchecked {
        ++i;
      }
    }
  }

  // --- Internal ---

  function _buy(
    INFTXMarketplaceZap.BuyOrder calldata buyOrder,
    address receiver,
    bool revertIfIncomplete,
    uint256 value
  ) internal {
    // Execute the fill
    try
      NFTX_MARKETPLACE.buyAndRedeem{value: value}(
        buyOrder.vaultId,
        buyOrder.amount,
        buyOrder.specificIds,
        buyOrder.path,
        receiver
      )
    {} catch {
      // Revert if specified
      if (revertIfIncomplete) {
        revert UnsuccessfulFill();
      }
    }
  }

  // --- Single ERC721 offer ---

  function sell(
    INFTXMarketplaceZap.SellOrder[] calldata orders,
    OfferParams calldata params,
    Fee[] calldata fees
  ) external nonReentrant {
    uint256 length = orders.length;
    for (uint256 i = 0; i < length; ) {
      // Execute fill
      _sell(orders[i], params.fillTo, params.revertIfIncomplete, fees);

      unchecked {
        ++i;
      }
    }
  }

  function _sell(
    INFTXMarketplaceZap.SellOrder calldata sellOrder,
    address receiver,
    bool revertIfIncomplete,
    Fee[] calldata fees
  ) internal {
    address collection = sellOrder.collection;

    INFTXVault vault = INFTXVault(NFTX_MARKETPLACE.nftxFactory().vault(sellOrder.vaultId));

    // Execute the sell
    if (!vault.is1155()) {
      _approveERC721IfNeeded(IERC721(collection), address(NFTX_MARKETPLACE));

      try
        NFTX_MARKETPLACE.mintAndSell721WETH(
          sellOrder.vaultId,
          sellOrder.specificIds,
          sellOrder.price,
          sellOrder.path,
          address(this)
        )
      {
        // Pay fees
        uint256 feesLength = fees.length;
        for (uint256 i; i < feesLength; ) {
          Fee memory fee = fees[i];
          _sendERC20(fee.recipient, fee.amount, sellOrder.currency);
          unchecked {
            ++i;
          }
        }

        // Forward any left payment to the specified receiver
        _sendAllERC20(receiver, sellOrder.currency);
      } catch {
        // Revert if specified
        if (revertIfIncomplete) {
          revert UnsuccessfulFill();
        }
      }

      // Refund any ERC721 leftover
      uint256 length = sellOrder.specificIds.length;
      for (uint256 i = 0; i < length; ) {
        _sendAllERC721(receiver, IERC721(collection), sellOrder.specificIds[i]);

        unchecked {
          ++i;
        }
      }
    } else {
      _approveERC1155IfNeeded(IERC1155(collection), address(NFTX_MARKETPLACE));

      try
        NFTX_MARKETPLACE.mintAndSell1155WETH(
          sellOrder.vaultId,
          sellOrder.specificIds,
          sellOrder.amounts,
          sellOrder.price,
          sellOrder.path,
          address(this)
        )
      {
        // Pay fees
        uint256 feesLength = fees.length;
        for (uint256 i; i < feesLength; ) {
          Fee memory fee = fees[i];
          _sendERC20(fee.recipient, fee.amount, sellOrder.currency);
          unchecked {
            ++i;
          }
        }

        // Forward any left payment to the specified receiver
        _sendAllERC20(receiver, sellOrder.currency);
      } catch {
        // Revert if specified
        if (revertIfIncomplete) {
          revert UnsuccessfulFill();
        }
      }

      // Refund any ERC1155 leftover
      uint256 length = sellOrder.specificIds.length;
      for (uint256 i = 0; i < length; ) {
        _sendAllERC1155(receiver, IERC1155(collection), sellOrder.specificIds[i]);

        unchecked {
          ++i;
        }
      }
    }
  }

  // --- ERC721 / ERC1155 hooks ---

  // Single token offer acceptance can be done approval-less by using the
  // standard `safeTransferFrom` method together with specifying data for
  // further contract calls. An example:
  // `safeTransferFrom(
  //      0xWALLET,
  //      0xMODULE,
  //      TOKEN_ID,
  //      0xABI_ENCODED_ROUTER_EXECUTION_CALLDATA_FOR_OFFER_ACCEPTANCE
  // )`

  function onERC721Received(
    address, // operator,
    address, // from
    uint256, // tokenId,
    bytes calldata data
  ) external returns (bytes4) {
    if (data.length > 0) {
      _makeCall(router, data, 0);
    }

    return this.onERC721Received.selector;
  }

  function onERC1155Received(
    address, // operator
    address, // from
    uint256, // tokenId
    uint256, // amount
    bytes calldata data
  ) external returns (bytes4) {
    if (data.length > 0) {
      _makeCall(router, data, 0);
    }

    return this.onERC1155Received.selector;
  }
}
