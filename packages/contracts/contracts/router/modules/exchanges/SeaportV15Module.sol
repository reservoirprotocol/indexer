// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {IERC1155} from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

import {BaseExchangeModule} from "./BaseExchangeModule.sol";
import {BaseModule} from "../BaseModule.sol";
import {ISeaport} from "../../../interfaces/ISeaport.sol";

// Notes on the Seaport module:
// - supports filling listings (both ERC721/ERC1155)
// - supports filling offers (both ERC721/ERC1155)

contract SeaportV15Module is BaseExchangeModule {
  // --- Structs ---

  struct SeaportETHListingWithPrice {
    ISeaport.AdvancedOrder order;
    uint256 price;
  }

  struct SeaportPrivateListingWithPrice {
    ISeaport.AdvancedOrder[] orders;
    ISeaport.Fulfillment[] fulfillments;
    uint256 price;
  }

  // --- Fields ---

  ISeaport public immutable EXCHANGE;

  // --- Constructor ---

  constructor(
    address owner,
    address router,
    address exchange
  ) BaseModule(owner) BaseExchangeModule(router) {
    EXCHANGE = ISeaport(exchange);
  }

  // --- Fallback ---

  receive() external payable {}

  // --- Single ETH listing ---

  function acceptETHListing(
    ISeaport.AdvancedOrder calldata order,
    ETHListingParams calldata params,
    Fee[] calldata fees
  )
    external
    payable
    nonReentrant
    refundETHLeftover(params.refundTo)
    chargeETHFees(fees, params.amount)
  {
    // Execute the fill
    params.revertIfIncomplete
      ? _fillSingleOrderWithRevertIfIncomplete(
        order,
        new ISeaport.CriteriaResolver[](0),
        params.fillTo,
        params.amount
      )
      : _fillSingleOrder(order, new ISeaport.CriteriaResolver[](0), params.fillTo, params.amount);
  }

  // --- Single ERC20 listing ---

  function acceptERC20Listing(
    ISeaport.AdvancedOrder calldata order,
    ERC20ListingParams calldata params,
    Fee[] calldata fees
  )
    external
    nonReentrant
    refundERC20Leftover(params.refundTo, params.token)
    chargeERC20Fees(fees, params.token, params.amount)
  {
    // Approve the exchange if needed
    _approveERC20IfNeeded(params.token, address(EXCHANGE), params.amount);

    // Execute the fill
    params.revertIfIncomplete
      ? _fillSingleOrderWithRevertIfIncomplete(
        order,
        new ISeaport.CriteriaResolver[](0),
        params.fillTo,
        0
      )
      : _fillSingleOrder(order, new ISeaport.CriteriaResolver[](0), params.fillTo, 0);
  }

  // --- Multiple ETH listings ---

  function acceptETHListings(
    SeaportETHListingWithPrice[] calldata orders,
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
    ISeaport.CriteriaResolver[] memory criteriaResolvers = new ISeaport.CriteriaResolver[](0);

    // Execute the fills
    if (params.revertIfIncomplete) {
      for (uint256 i; i < length; ) {
        _fillSingleOrderWithRevertIfIncomplete(
          orders[i].order,
          criteriaResolvers,
          params.fillTo,
          orders[i].price
        );

        unchecked {
          ++i;
        }
      }
    } else {
      for (uint256 i; i < length; ) {
        _fillSingleOrder(orders[i].order, criteriaResolvers, params.fillTo, orders[i].price);

        unchecked {
          ++i;
        }
      }
    }
  }

  // --- Multiple ERC20 listings ---

  function acceptERC20Listings(
    ISeaport.AdvancedOrder[] calldata orders,
    ERC20ListingParams calldata params,
    Fee[] calldata fees
  )
    external
    nonReentrant
    refundERC20Leftover(params.refundTo, params.token)
    chargeERC20Fees(fees, params.token, params.amount)
  {
    // Approve the exchange if needed
    _approveERC20IfNeeded(params.token, address(EXCHANGE), params.amount);

    uint256 length = orders.length;
    ISeaport.CriteriaResolver[] memory criteriaResolvers = new ISeaport.CriteriaResolver[](0);

    // Execute the fills
    if (params.revertIfIncomplete) {
      for (uint256 i; i < length; ) {
        _fillSingleOrderWithRevertIfIncomplete(orders[i], criteriaResolvers, params.fillTo, 0);

        unchecked {
          ++i;
        }
      }
    } else {
      for (uint256 i; i < length; ) {
        _fillSingleOrder(orders[i], criteriaResolvers, params.fillTo, 0);

        unchecked {
          ++i;
        }
      }
    }
  }

  // --- Multiple ETH private listings ---

  function acceptETHPrivateListings(
    SeaportPrivateListingWithPrice[] calldata orders,
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
    ISeaport.CriteriaResolver[] memory criteriaResolvers = new ISeaport.CriteriaResolver[](0);

    // Execute the fills
    if (params.revertIfIncomplete) {
      for (uint256 i; i < length; ) {
        _fillPrivateOrderWithRevertIfIncomplete(
          orders[i].orders,
          criteriaResolvers,
          orders[i].fulfillments,
          params.fillTo,
          orders[i].price
        );

        unchecked {
          ++i;
        }
      }
    } else {
      for (uint256 i; i < length; ) {
        _fillPrivateOrder(
          orders[i].orders,
          criteriaResolvers,
          orders[i].fulfillments,
          params.fillTo,
          orders[i].price
        );

        unchecked {
          ++i;
        }
      }
    }
  }

  // --- Multiple Private ERC20 Private listings ---

  function acceptERC20PrivateListings(
    SeaportPrivateListingWithPrice[] calldata orders,
    ERC20ListingParams calldata params,
    Fee[] calldata fees
  )
    external
    nonReentrant
    refundERC20Leftover(params.refundTo, params.token)
    chargeERC20Fees(fees, params.token, params.amount)
  {
    // Approve the exchange if needed
    _approveERC20IfNeeded(params.token, address(EXCHANGE), params.amount);

    uint256 length = orders.length;
    ISeaport.CriteriaResolver[] memory criteriaResolvers = new ISeaport.CriteriaResolver[](0);

    // Execute the fills
    if (params.revertIfIncomplete) {
      for (uint256 i; i < length; ) {
        _fillPrivateOrderWithRevertIfIncomplete(
          orders[i].orders,
          criteriaResolvers,
          orders[i].fulfillments,
          params.fillTo,
          0
        );

        unchecked {
          ++i;
        }
      }
    } else {
      for (uint256 i; i < length; ) {
        _fillPrivateOrder(
          orders[i].orders,
          criteriaResolvers,
          orders[i].fulfillments,
          params.fillTo,
          0
        );

        unchecked {
          ++i;
        }
      }
    }
  }

  // --- Single ERC721 offer ---

  function acceptERC721Offer(
    ISeaport.AdvancedOrder calldata order,
    // Use `memory` instead of `calldata` to avoid `Stack too deep` errors
    ISeaport.CriteriaResolver[] memory criteriaResolvers,
    OfferParams calldata params,
    Fee[] calldata fees
  ) external nonReentrant {
    // Extract the ERC721 token from the consideration items
    ISeaport.ConsiderationItem calldata nftItem = order.parameters.consideration[0];
    if (
      nftItem.itemType != ISeaport.ItemType.ERC721 &&
      nftItem.itemType != ISeaport.ItemType.ERC721_WITH_CRITERIA
    ) {
      revert WrongParams();
    }
    IERC721 nftToken = IERC721(nftItem.token);

    // Extract the payment token from the offer items
    ISeaport.OfferItem calldata paymentItem = order.parameters.offer[0];
    IERC20 paymentToken = IERC20(paymentItem.token);

    // Approve the exchange if needed
    _approveERC721IfNeeded(nftToken, address(EXCHANGE));
    _approveERC20IfNeeded(paymentToken, address(EXCHANGE), type(uint256).max);

    // Execute the fill
    params.revertIfIncomplete
      ? _fillSingleOrderWithRevertIfIncomplete(order, criteriaResolvers, address(this), 0)
      : _fillSingleOrder(order, criteriaResolvers, address(this), 0);

    uint256 identifier = nftItem.itemType == ISeaport.ItemType.ERC721
      ? nftItem.identifierOrCriteria
      : criteriaResolvers[0].identifier;

    // Pay fees
    if (nftToken.ownerOf(identifier) != address(this)) {
      // Only pay fees if the fill was successful
      uint256 feesLength = fees.length;
      for (uint256 i; i < feesLength; ) {
        Fee memory fee = fees[i];
        _sendERC20(fee.recipient, fee.amount, paymentToken);

        unchecked {
          ++i;
        }
      }
    }

    // Refund any ERC721 leftover
    _sendAllERC721(params.refundTo, nftToken, identifier);

    // Forward any left payment to the specified receiver
    _sendAllERC20(params.fillTo, paymentToken);
  }

  // --- Single ERC1155 offer ---

  function acceptERC1155Offer(
    ISeaport.AdvancedOrder calldata order,
    // Use `memory` instead of `calldata` to avoid `Stack too deep` errors
    ISeaport.CriteriaResolver[] memory criteriaResolvers,
    OfferParams calldata params,
    Fee[] calldata fees
  ) external nonReentrant {
    // Extract the ERC1155 token from the consideration items
    ISeaport.ConsiderationItem calldata nftItem = order.parameters.consideration[0];
    if (
      nftItem.itemType != ISeaport.ItemType.ERC1155 &&
      nftItem.itemType != ISeaport.ItemType.ERC1155_WITH_CRITERIA
    ) {
      revert WrongParams();
    }
    IERC1155 nftToken = IERC1155(nftItem.token);

    // Extract the payment token from the offer items
    ISeaport.OfferItem calldata paymentItem = order.parameters.offer[0];
    IERC20 paymentToken = IERC20(paymentItem.token);

    // Approve the exchange if needed
    _approveERC1155IfNeeded(nftToken, address(EXCHANGE));
    _approveERC20IfNeeded(paymentToken, address(EXCHANGE), type(uint256).max);

    uint256 identifier = nftItem.itemType == ISeaport.ItemType.ERC1155
      ? nftItem.identifierOrCriteria
      : criteriaResolvers[0].identifier;

    uint256 balanceBefore = nftToken.balanceOf(address(this), identifier);

    // Execute the fill
    params.revertIfIncomplete
      ? _fillSingleOrderWithRevertIfIncomplete(order, criteriaResolvers, address(this), 0)
      : _fillSingleOrder(order, criteriaResolvers, address(this), 0);

    uint256 balanceAfter = nftToken.balanceOf(address(this), identifier);

    // Pay fees
    uint256 amountFilled = balanceBefore - balanceAfter;
    if (amountFilled > 0) {
      uint256 feesLength = fees.length;
      for (uint256 i; i < feesLength; ) {
        Fee memory fee = fees[i];
        _sendERC20(
          fee.recipient,
          // Only pay fees for the amount that was actually filled
          (fee.amount * amountFilled) / order.numerator,
          paymentToken
        );

        unchecked {
          ++i;
        }
      }
    }

    // Refund any ERC1155 leftover
    _sendAllERC1155(params.refundTo, nftToken, identifier);

    // Forward any left payment to the specified receiver
    _sendAllERC20(params.fillTo, paymentToken);
  }

  // --- Generic handler (used for Seaport-based approvals) ---

  function matchOrders(
    ISeaport.Order[] calldata orders,
    ISeaport.Fulfillment[] calldata fulfillments
  ) external nonReentrant {
    // We don't perform any kind of input or return value validation,
    // so this function should be used with precaution - the official
    // way to use it is only for Seaport-based approvals
    EXCHANGE.matchOrders(orders, fulfillments);
  }

  // --- ERC1271 ---

  function isValidSignature(bytes32, bytes memory) external pure returns (bytes4) {
    // Needed for filling private listings
    return this.isValidSignature.selector;
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

  // NOTE: In lots of cases, Seaport will not revert if fills were not
  // fully executed. An example of that is partial filling, which will
  // successfully fill any amount that is still available (including a
  // zero amount). One way to ensure that we revert in case of partial
  // executions is to check the order's filled amount before and after
  // we trigger the fill (we can use Seaport's `getOrderStatus` method
  // to check). Since this can be expensive in terms of gas, we have a
  // separate method variant to be called when reverts are enabled.

  function _fillSingleOrder(
    ISeaport.AdvancedOrder calldata order,
    // Use `memory` instead of `calldata` to avoid `Stack too deep` errors
    ISeaport.CriteriaResolver[] memory criteriaResolvers,
    address receiver,
    uint256 value
  ) internal {
    // Execute the fill
    try
      EXCHANGE.fulfillAdvancedOrder{value: value}(order, criteriaResolvers, bytes32(0), receiver)
    {} catch {}
  }

  function _fillSingleOrderWithRevertIfIncomplete(
    ISeaport.AdvancedOrder calldata order,
    // Use `memory` instead of `calldata` to avoid `Stack too deep` errors
    ISeaport.CriteriaResolver[] memory criteriaResolvers,
    address receiver,
    uint256 value
  ) internal {
    // Cache the order's hash
    bytes32 orderHash = _getOrderHash(order.parameters);

    // Before filling, get the order's filled amount
    uint256 beforeFilledAmount = _getFilledAmount(orderHash, order.denominator);

    // Execute the fill
    bool success;
    try
      EXCHANGE.fulfillAdvancedOrder{value: value}(order, criteriaResolvers, bytes32(0), receiver)
    returns (bool fulfilled) {
      success = fulfilled;
    } catch {
      revert UnsuccessfulFill();
    }

    if (!success) {
      revert UnsuccessfulFill();
    } else {
      // After successfully filling, get the order's filled amount
      uint256 afterFilledAmount = _getFilledAmount(orderHash, order.denominator);

      // Make sure the amount filled as part of this call is correct
      if (afterFilledAmount - beforeFilledAmount != order.numerator) {
        revert UnsuccessfulFill();
      }
    }
  }

  function _fillPrivateOrder(
    ISeaport.AdvancedOrder[] calldata advancedOrders,
    // Use `memory` instead of `calldata` to avoid `Stack too deep` errors
    ISeaport.CriteriaResolver[] memory criteriaResolvers,
    ISeaport.Fulfillment[] memory fulfillments,
    address receiver,
    uint256 value
  ) internal {
    // Execute the fill
    try
      EXCHANGE.matchAdvancedOrders{value: value}(
        advancedOrders,
        criteriaResolvers,
        fulfillments,
        receiver
      )
    {} catch {}
  }

  function _fillPrivateOrderWithRevertIfIncomplete(
    ISeaport.AdvancedOrder[] calldata advancedOrders,
    // Use `memory` instead of `calldata` to avoid `Stack too deep` errors
    ISeaport.CriteriaResolver[] memory criteriaResolvers,
    ISeaport.Fulfillment[] memory fulfillments,
    address receiver,
    uint256 value
  ) internal {
    // Execute the fill
    try
      EXCHANGE.matchAdvancedOrders{value: value}(
        advancedOrders,
        criteriaResolvers,
        fulfillments,
        receiver
      )
    {} catch {
      revert UnsuccessfulFill();
    }
  }

  function _getOrderHash(
    // Must use `memory` instead of `calldata` for the below cast
    ISeaport.OrderParameters memory orderParameters
  ) internal view returns (bytes32 orderHash) {
    // `OrderParameters` and `OrderComponents` share the exact same
    // fields, apart from the last one, so here we simply treat the
    // `orderParameters` argument as `OrderComponents` and then set
    // the last field to the correct data
    ISeaport.OrderComponents memory orderComponents;
    assembly {
      orderComponents := orderParameters
    }
    orderComponents.counter = EXCHANGE.getCounter(orderParameters.offerer);

    orderHash = EXCHANGE.getOrderHash(orderComponents);
  }

  function _getFilledAmount(
    bytes32 orderHash,
    uint256 adjustedTotalSize
  ) internal view returns (uint256 adjustedTotalFilled) {
    (, , uint256 totalFilled, uint256 totalSize) = EXCHANGE.getOrderStatus(orderHash);
    adjustedTotalFilled = totalSize > 0 ? (totalFilled * adjustedTotalSize) / totalSize : 0;
  }
}
