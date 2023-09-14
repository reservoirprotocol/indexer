// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC1155} from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";

import {BaseExchangeModule} from "./BaseExchangeModule.sol";
import {BaseModule} from "../BaseModule.sol";
import {IX2Y2} from "../../../interfaces/IX2Y2.sol";

// Notes on the X2Y2 module:
// - supports filling listings (both ERC721/ERC1155 but only ETH-denominated)
// - supports filling offers (both ERC721/ERC1155)

contract X2Y2Module is BaseExchangeModule {
  using SafeERC20 for IERC20;

  // --- Fields ---

  IX2Y2 public immutable EXCHANGE;

  address public immutable ERC721_DELEGATE;
  address public immutable ERC1155_DELEGATE;

  // --- Constructor ---

  constructor(
    address owner,
    address router,
    address exchange,
    address erc721Delegate,
    address erc1155Delegate
  ) BaseModule(owner) BaseExchangeModule(router) {
    EXCHANGE = IX2Y2(exchange);
    ERC721_DELEGATE = erc721Delegate;
    ERC1155_DELEGATE = erc1155Delegate;
  }

  // --- Fallback ---

  receive() external payable {}

  // --- Single ETH listing ---

  function acceptETHListing(
    IX2Y2.RunInput calldata input,
    ETHListingParams calldata params,
    Fee[] calldata fees
  )
    external
    payable
    nonReentrant
    refundETHLeftover(params.refundTo)
    chargeETHFees(fees, params.amount)
  {
    // Execute fill
    _buy(input, params.fillTo, params.revertIfIncomplete, params.amount);
  }

  // --- Multiple ETH listings ---

  function acceptETHListings(
    IX2Y2.RunInput[] calldata inputs,
    ETHListingParams calldata params,
    Fee[] calldata fees
  )
    external
    payable
    nonReentrant
    refundETHLeftover(params.refundTo)
    chargeETHFees(fees, params.amount)
  {
    // X2Y2 does not support batch filling so we fill orders one by one
    uint256 length = inputs.length;
    for (uint256 i = 0; i < length; ) {
      // Execute fill
      _buy(inputs[i], params.fillTo, params.revertIfIncomplete, inputs[i].details[0].price);

      unchecked {
        ++i;
      }
    }
  }

  // --- [ERC721] Single offer ---

  function acceptERC721Offer(
    IX2Y2.RunInput calldata input,
    OfferParams calldata params,
    Fee[] calldata fees
  ) external nonReentrant {
    if (input.details.length != 1) {
      revert WrongParams();
    }

    // Extract the order's corresponding token
    IX2Y2.SettleDetail calldata detail = input.details[0];
    IX2Y2.Order calldata order = input.orders[detail.orderIdx];
    IX2Y2.OrderItem calldata orderItem = order.items[detail.itemIdx];
    if (detail.op != IX2Y2.Op.COMPLETE_BUY_OFFER) {
      revert WrongParams();
    }

    // Apply any mask (if required)
    bytes memory data = orderItem.data;
    {
      if (order.dataMask.length > 0 && detail.dataReplacement.length > 0) {
        _arrayReplace(data, detail.dataReplacement, order.dataMask);
      }
    }

    IX2Y2.ERC721Pair[] memory pairs = abi.decode(orderItem.data, (IX2Y2.ERC721Pair[]));
    if (pairs.length != 1) {
      revert WrongParams();
    }

    IERC721 collection = pairs[0].token;
    uint256 tokenId = pairs[0].tokenId;

    // Approve the delegate if needed
    _approveERC721IfNeeded(collection, ERC721_DELEGATE);

    // Execute fill
    try EXCHANGE.run(input) {
      // Pay fees
      uint256 feesLength = fees.length;
      for (uint256 i; i < feesLength; ) {
        Fee memory fee = fees[i];
        _sendERC20(fee.recipient, fee.amount, order.currency);

        unchecked {
          ++i;
        }
      }

      // Forward any left payment to the specified receiver
      _sendAllERC20(params.fillTo, order.currency);
    } catch {
      // Revert if specified
      if (params.revertIfIncomplete) {
        revert UnsuccessfulFill();
      }
    }

    // Refund any ERC721 leftover
    _sendAllERC721(params.refundTo, collection, tokenId);
  }

  // --- [ERC1155] Single offer ---

  function acceptERC1155Offer(
    IX2Y2.RunInput calldata input,
    OfferParams calldata params,
    Fee[] calldata fees
  ) external nonReentrant {
    if (input.details.length != 1) {
      revert WrongParams();
    }

    // Extract the order's corresponding token
    IX2Y2.SettleDetail calldata detail = input.details[0];
    IX2Y2.Order calldata order = input.orders[detail.orderIdx];
    IX2Y2.OrderItem calldata orderItem = order.items[detail.itemIdx];
    if (detail.op != IX2Y2.Op.COMPLETE_BUY_OFFER) {
      revert WrongParams();
    }

    // Apply any mask (if required)
    bytes memory data = orderItem.data;
    {
      if (order.dataMask.length > 0 && detail.dataReplacement.length > 0) {
        _arrayReplace(data, detail.dataReplacement, order.dataMask);
      }
    }

    IX2Y2.ERC1155Pair[] memory pairs = abi.decode(orderItem.data, (IX2Y2.ERC1155Pair[]));
    if (pairs.length != 1) {
      revert WrongParams();
    }

    IERC1155 collection = pairs[0].token;
    uint256 tokenId = pairs[0].tokenId;

    // Approve the delegate if needed
    _approveERC1155IfNeeded(collection, ERC1155_DELEGATE);

    // Execute fill
    try EXCHANGE.run(input) {
      // Pay fees
      uint256 feesLength = fees.length;
      for (uint256 i; i < feesLength; ) {
        Fee memory fee = fees[i];
        _sendERC20(fee.recipient, fee.amount, order.currency);

        unchecked {
          ++i;
        }
      }

      // Forward any left payment to the specified receiver
      _sendAllERC20(params.fillTo, order.currency);
    } catch {
      // Revert if specified
      if (params.revertIfIncomplete) {
        revert UnsuccessfulFill();
      }
    }

    // Refund any ERC1155 leftover
    _sendAllERC1155(params.refundTo, collection, tokenId);
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

  // --- Internal ---

  function _arrayReplace(
    bytes memory source,
    bytes memory replacement,
    bytes memory mask
  ) internal view virtual {
    uint256 sourceLength = source.length;
    for (uint256 i; i < sourceLength; ) {
      if (mask[i] != 0) {
        source[i] = replacement[i];
      }

      unchecked {
        ++i;
      }
    }
  }

  function _buy(
    IX2Y2.RunInput calldata input,
    address receiver,
    bool revertIfIncomplete,
    uint256 value
  ) internal {
    if (input.details.length != 1) {
      revert WrongParams();
    }

    // Extract the order's corresponding token
    IX2Y2.SettleDetail calldata detail = input.details[0];
    IX2Y2.Order calldata order = input.orders[detail.orderIdx];
    IX2Y2.OrderItem calldata orderItem = order.items[detail.itemIdx];
    if (detail.op != IX2Y2.Op.COMPLETE_SELL_OFFER) {
      revert WrongParams();
    }

    // Execute fill
    try EXCHANGE.run{value: value}(input) {
      if (order.delegateType == 1) {
        IX2Y2.ERC721Pair[] memory pairs = abi.decode(orderItem.data, (IX2Y2.ERC721Pair[]));
        if (pairs.length != 1) {
          revert WrongParams();
        }

        pairs[0].token.safeTransferFrom(address(this), receiver, pairs[0].tokenId);
      } else {
        IX2Y2.ERC1155Pair[] memory pairs = abi.decode(orderItem.data, (IX2Y2.ERC1155Pair[]));
        if (pairs.length != 1) {
          revert WrongParams();
        }

        pairs[0].token.safeTransferFrom(
          address(this),
          receiver,
          pairs[0].tokenId,
          pairs[0].amount,
          ""
        );
      }
    } catch {
      // Revert if specified
      if (revertIfIncomplete) {
        revert UnsuccessfulFill();
      }
    }
  }
}
