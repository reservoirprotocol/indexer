// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC1155} from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";

import {BaseExchangeModule} from "./BaseExchangeModule.sol";
import {BaseModule} from "../BaseModule.sol";

import {INFTXMarketplace0xZap} from "../../../interfaces/INFTXMarketplace0xZap.sol";
import {INFTXVault} from "../../../interfaces/INFTXVault.sol";
import {INFTXVaultFactory} from "../../../interfaces/INFTXVaultFactory.sol";

contract NFTXZeroExModule is BaseExchangeModule {
  // --- Fields ---

  INFTXMarketplace0xZap public immutable NFTX_ZEROEX_MARKETPLACE;

  bytes4 public constant ERC721_INTERFACE = 0x80ac58cd;
  bytes4 public constant ERC1155_INTERFACE = 0xd9b67a26;

  // --- Constructor ---

  constructor(
    address owner,
    address router,
    address nftxMarketplace
  ) BaseModule(owner) BaseExchangeModule(router) {
    NFTX_ZEROEX_MARKETPLACE = INFTXMarketplace0xZap(nftxMarketplace);
  }

  // --- Fallback ---

  receive() external payable {}

  // --- Multiple ETH listings ---

  function buyWithETH(
    INFTXMarketplace0xZap.BuyOrder[] calldata orders,
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
      INFTXMarketplace0xZap.BuyOrder memory order = orders[i];

      // Execute fill
      _buy(orders[i], params.fillTo, params.revertIfIncomplete, order.price);

      unchecked {
        ++i;
      }
    }
  }

  // --- Internal ---

  function _buy(
    INFTXMarketplace0xZap.BuyOrder calldata buyOrder,
    address receiver,
    bool revertIfIncomplete,
    uint256 value
  ) internal {
    // Execute the fill
    try
      NFTX_ZEROEX_MARKETPLACE.buyAndRedeem{value: value}(
        buyOrder.vaultId,
        buyOrder.amount,
        buyOrder.specificIds,
        buyOrder.swapCallData,
        payable(receiver)
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
    INFTXMarketplace0xZap.SellOrder[] calldata orders,
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
    INFTXMarketplace0xZap.SellOrder calldata sellOrder,
    address receiver,
    bool revertIfIncomplete,
    Fee[] calldata fees
  ) internal {
    address collection = sellOrder.collection;

    INFTXVault vault = INFTXVault(NFTX_ZEROEX_MARKETPLACE.nftxFactory().vault(sellOrder.vaultId));

    // Execute the sell
    if (!vault.is1155()) {
      _approveERC721IfNeeded(IERC721(collection), address(NFTX_ZEROEX_MARKETPLACE));

      // Return ETH
      try
        NFTX_ZEROEX_MARKETPLACE.mintAndSell721(
          sellOrder.vaultId,
          sellOrder.specificIds,
          sellOrder.swapCallData,
          payable(address(this))
        )
      {
        // Pay fees
        uint256 feesLength = fees.length;
        for (uint256 i; i < feesLength; ) {
          Fee memory fee = fees[i];
          _sendETH(fee.recipient, fee.amount);

          unchecked {
            ++i;
          }
        }

        // Forward any left payment to the specified receiver
        _sendAllETH(receiver);
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
      _approveERC1155IfNeeded(IERC1155(collection), address(NFTX_ZEROEX_MARKETPLACE));

      try
        NFTX_ZEROEX_MARKETPLACE.mintAndSell1155(
          sellOrder.vaultId,
          sellOrder.specificIds,
          sellOrder.amounts,
          sellOrder.swapCallData,
          payable(address(this))
        )
      {
        // Pay fees
        uint256 feesLength = fees.length;
        for (uint256 i; i < feesLength; ) {
          Fee memory fee = fees[i];
          _sendETH(fee.recipient, fee.amount);
          unchecked {
            ++i;
          }
        }

        // Forward any left payment to the specified receiver
        _sendAllETH(receiver);
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
