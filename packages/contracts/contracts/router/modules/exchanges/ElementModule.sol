// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC1155} from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";

import {BaseExchangeModule} from "./BaseExchangeModule.sol";
import {BaseModule} from "../BaseModule.sol";
import {IElement} from "../../../interfaces/IElement.sol";

// Notes:
// - supports filling listings (both ERC721/ERC1155)
// - supports filling offers (both ERC721/ERC1155)

contract ElementModule is BaseExchangeModule {
  using SafeERC20 for IERC20;

  // --- Fields ---

  IElement public immutable EXCHANGE;

  // --- Constructor ---

  constructor(
    address owner,
    address router,
    address exchange
  ) BaseModule(owner) BaseExchangeModule(router) {
    EXCHANGE = IElement(exchange);
  }

  // --- Fallback ---

  receive() external payable {}

  // --- [ERC721] Single ETH listing ---

  function acceptETHListingERC721(
    IElement.NFTSellOrder calldata order,
    IElement.Signature calldata signature,
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
    _buyERC721Ex(order, signature, params.fillTo, params.revertIfIncomplete, params.amount);
  }

  // --- [ERC721] Single ERC20 listing ---

  function acceptERC20ListingERC721(
    IElement.NFTSellOrder calldata order,
    IElement.Signature calldata signature,
    ERC20ListingParams calldata params,
    Fee[] calldata fees
  )
    external
    payable
    nonReentrant
    refundERC20Leftover(params.refundTo, params.token)
    chargeERC20Fees(fees, params.token, params.amount)
  {
    // Approve the exchange if needed
    _approveERC20IfNeeded(params.token, address(EXCHANGE), params.amount);

    // Execute fill
    _buyERC721Ex(order, signature, params.fillTo, params.revertIfIncomplete, 0);
  }

  // --- [ERC721] Multiple ETH listings ---

  function acceptETHListingsERC721(
    IElement.NFTSellOrder[] calldata orders,
    IElement.Signature[] calldata signatures,
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
    _buyERC721sEx(orders, signatures, params.fillTo, params.revertIfIncomplete, params.amount);
  }

  // --- [ERC721] Multiple ERC20 listings ---

  function acceptERC20ListingsERC721(
    IElement.NFTSellOrder[] calldata orders,
    IElement.Signature[] calldata signatures,
    ERC20ListingParams calldata params,
    Fee[] calldata fees
  )
    external
    payable
    nonReentrant
    refundERC20Leftover(params.refundTo, params.token)
    chargeERC20Fees(fees, params.token, params.amount)
  {
    // Approve the exchange if needed
    _approveERC20IfNeeded(params.token, address(EXCHANGE), params.amount);

    // Execute fill
    _buyERC721sEx(orders, signatures, params.fillTo, params.revertIfIncomplete, 0);
  }

  // --- [ERC721] Single ETH listing V2 ---

  function acceptETHListingERC721V2(
    IElement.BatchSignedOrder calldata order,
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
    _fillBatchSignedOrder(order, params.fillTo, params.revertIfIncomplete, params.amount);
  }

  // --- [ERC721] Single ERC20 listing V2 ---

  function acceptERC20ListingERC721V2(
    IElement.BatchSignedOrder calldata order,
    ERC20ListingParams calldata params,
    Fee[] calldata fees
  )
    external
    payable
    nonReentrant
    refundERC20Leftover(params.refundTo, params.token)
    chargeERC20Fees(fees, params.token, params.amount)
  {
    // Approve the exchange if needed
    _approveERC20IfNeeded(params.token, address(EXCHANGE), params.amount);

    // Execute fill
    _fillBatchSignedOrder(order, params.fillTo, params.revertIfIncomplete, 0);
  }

  // --- [ERC721] Multiple ETH listings V2 ---

  function acceptETHListingsERC721V2(
    IElement.BatchSignedOrder[] calldata orders,
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
    _fillBatchSignedOrders(orders, params.fillTo, params.revertIfIncomplete, params.amount);
  }

  // --- [ERC721] Multiple ERC20 listings V2 ---

  function acceptERC20ListingsERC721V2(
    IElement.BatchSignedOrder[] calldata orders,
    ERC20ListingParams calldata params,
    Fee[] calldata fees
  )
    external
    payable
    nonReentrant
    refundERC20Leftover(params.refundTo, params.token)
    chargeERC20Fees(fees, params.token, params.amount)
  {
    // Approve the exchange if needed
    _approveERC20IfNeeded(params.token, address(EXCHANGE), params.amount);

    // Execute fill
    _fillBatchSignedOrders(orders, params.fillTo, params.revertIfIncomplete, 0);
  }

  // --- [ERC1155] Single ETH listing ---

  function acceptETHListingERC1155(
    IElement.ERC1155SellOrder calldata order,
    IElement.Signature calldata signature,
    uint128 amount,
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
    _buyERC1155Ex(
      order,
      signature,
      amount,
      params.fillTo,
      params.revertIfIncomplete,
      params.amount
    );
  }

  // --- [ERC1155] Single ERC20 listing ---

  function acceptERC20ListingERC1155(
    IElement.ERC1155SellOrder calldata order,
    IElement.Signature calldata signature,
    uint128 amount,
    ERC20ListingParams calldata params,
    Fee[] calldata fees
  )
    external
    payable
    nonReentrant
    refundERC20Leftover(params.refundTo, params.token)
    chargeERC20Fees(fees, params.token, params.amount)
  {
    // Approve the exchange if needed
    _approveERC20IfNeeded(params.token, address(EXCHANGE), params.amount);

    // Execute fill
    _buyERC1155Ex(order, signature, amount, params.fillTo, params.revertIfIncomplete, 0);
  }

  // --- [ERC1155] Multiple ETH listings ---

  function acceptETHListingsERC1155(
    IElement.ERC1155SellOrder[] calldata orders,
    IElement.Signature[] calldata signatures,
    uint128[] calldata amounts,
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
    _buyERC1155sEx(
      orders,
      signatures,
      amounts,
      params.fillTo,
      params.revertIfIncomplete,
      params.amount
    );
  }

  // --- [ERC1155] Multiple ERC20 listings ---

  function acceptERC20ListingsERC1155(
    IElement.ERC1155SellOrder[] calldata orders,
    IElement.Signature[] calldata signatures,
    uint128[] calldata amounts,
    ERC20ListingParams calldata params,
    Fee[] calldata fees
  )
    external
    payable
    nonReentrant
    refundERC20Leftover(params.refundTo, params.token)
    chargeERC20Fees(fees, params.token, params.amount)
  {
    // Approve the exchange if needed
    _approveERC20IfNeeded(params.token, address(EXCHANGE), params.amount);

    // Execute fill
    _buyERC1155sEx(orders, signatures, amounts, params.fillTo, params.revertIfIncomplete, 0);
  }

  // --- [ERC721] Single offer ---

  function acceptERC721Offer(
    IElement.NFTBuyOrder calldata order,
    IElement.Signature calldata signature,
    OfferParams calldata params,
    uint256 tokenId,
    Fee[] calldata fees
  ) external nonReentrant {
    // Approve the exchange if needed
    _approveERC721IfNeeded(IERC721(order.nft), address(EXCHANGE));

    // Execute fill
    try EXCHANGE.sellERC721(order, signature, tokenId, false, "") {
      // Pay fees
      uint256 feesLength = fees.length;
      for (uint256 i; i < feesLength; ) {
        Fee memory fee = fees[i];
        _sendERC20(fee.recipient, fee.amount, order.erc20Token);

        unchecked {
          ++i;
        }
      }

      // Forward any left payment to the specified receiver
      _sendAllERC20(params.fillTo, order.erc20Token);
    } catch {
      // Revert if specified
      if (params.revertIfIncomplete) {
        revert UnsuccessfulFill();
      }
    }

    // Refund any ERC721 leftover
    _sendAllERC721(params.refundTo, IERC721(order.nft), tokenId);
  }

  // --- [ERC1155] Single offer ---

  function acceptERC1155Offer(
    IElement.ERC1155BuyOrder calldata order,
    IElement.Signature calldata signature,
    uint128 amount,
    OfferParams calldata params,
    uint256 tokenId,
    Fee[] calldata fees
  ) external nonReentrant {
    // Approve the exchange if needed
    _approveERC1155IfNeeded(IERC1155(order.erc1155Token), address(EXCHANGE));

    // Execute fill
    try EXCHANGE.sellERC1155(order, signature, tokenId, amount, false, "") {
      // Pay fees
      uint256 feesLength = fees.length;
      for (uint256 i; i < feesLength; ) {
        Fee memory fee = fees[i];
        _sendERC20(fee.recipient, fee.amount, order.erc20Token);

        unchecked {
          ++i;
        }
      }

      // Forward any left payment to the specified receiver
      _sendAllERC20(params.fillTo, order.erc20Token);
    } catch {
      // Revert if specified
      if (params.revertIfIncomplete) {
        revert UnsuccessfulFill();
      }
    }

    // Refund any ERC1155 leftover
    _sendAllERC1155(params.refundTo, IERC1155(order.erc1155Token), tokenId);
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

  function _buyERC721Ex(
    IElement.NFTSellOrder calldata order,
    IElement.Signature calldata signature,
    address receiver,
    bool revertIfIncomplete,
    uint256 value
  ) internal {
    // Execute fill
    try EXCHANGE.buyERC721Ex{value: value}(order, signature, receiver, "") {} catch {
      // Revert if specified
      if (revertIfIncomplete) {
        revert UnsuccessfulFill();
      }
    }
  }

  function _buyERC721sEx(
    IElement.NFTSellOrder[] calldata orders,
    IElement.Signature[] calldata signatures,
    address receiver,
    bool revertIfIncomplete,
    uint256 value
  ) internal {
    uint256 length = orders.length;

    address[] memory takers = new address[](length);
    for (uint256 i; i < length; ) {
      takers[i] = receiver;
      unchecked {
        ++i;
      }
    }

    // Execute fill
    try
      EXCHANGE.batchBuyERC721sEx{value: value}(
        orders,
        signatures,
        takers,
        new bytes[](length),
        revertIfIncomplete
      )
    {} catch {
      // Revert if specified
      if (revertIfIncomplete) {
        revert UnsuccessfulFill();
      }
    }
  }

  function _fillBatchSignedOrder(
    IElement.BatchSignedOrder calldata order,
    address receiver,
    bool revertIfIncomplete,
    uint256 value
  ) internal {
    IElement.Parameter memory parameter;
    parameter.r = order.r;
    parameter.s = order.s;

    // data1 [56 bits(startNonce) + 8 bits(v) + 32 bits(listingTime) + 160 bits(maker)]
    parameter.data1 =
      (order.startNonce << 200) |
      (uint256(order.v) << 192) |
      (order.listingTime << 160) |
      uint256(uint160(order.maker));

    // data2 [64 bits(taker part1) + 32 bits(expiryTime) + 160 bits(erc20Token)]
    uint256 taker = uint256(uint160(receiver));
    parameter.data2 =
      ((taker >> 96) << 192) |
      (order.expirationTime << 160) |
      uint256(uint160(order.erc20Token));

    // data3 [96 bits(taker part2) + 160 bits(platformFeeRecipient)]
    parameter.data3 = (taker << 160) | uint256(uint160(order.platformFeeRecipient));

    // Execute fill
    try
      EXCHANGE.fillBatchSignedERC721Order{value: value}(parameter, order.collectionsBytes)
    {} catch {
      // Revert if specified
      if (revertIfIncomplete) {
        revert UnsuccessfulFill();
      }
    }
  }

  function _fillBatchSignedOrders(
    IElement.BatchSignedOrder[] calldata orders,
    address receiver,
    bool revertIfIncomplete,
    uint256 value
  ) internal {
    uint256 length = orders.length;
    uint256 taker = uint256(uint160(receiver));

    IElement.Parameters[] memory parameters = new IElement.Parameters[](length);
    for (uint256 i; i < length; ) {
      IElement.BatchSignedOrder calldata order = orders[i];

      IElement.Parameters memory parameter;
      parameter.r = order.r;
      parameter.s = order.s;
      parameter.collections = order.collectionsBytes;

      // data1 [56 bits(startNonce) + 8 bits(v) + 32 bits(listingTime) + 160 bits(maker)]
      parameter.data1 =
        (order.startNonce << 200) |
        (uint256(order.v) << 192) |
        (order.listingTime << 160) |
        uint256(uint160(order.maker));

      // data2 [64 bits(taker part1) + 32 bits(expiryTime) + 160 bits(erc20Token)]
      parameter.data2 =
        ((taker >> 96) << 192) |
        (order.expirationTime << 160) |
        uint256(uint160(order.erc20Token));

      // data3 [96 bits(taker part2) + 160 bits(platformFeeRecipient)]
      parameter.data3 = (taker << 160) | uint256(uint160(order.platformFeeRecipient));

      parameters[i] = parameter;
      unchecked {
        ++i;
      }
    }

    // Execute fill
    uint256 additional2 = revertIfIncomplete ? (1 << 248) : 0;
    try EXCHANGE.fillBatchSignedERC721Orders{value: value}(parameters, 0, additional2) {} catch {
      // Revert if specified
      if (revertIfIncomplete) {
        revert UnsuccessfulFill();
      }
    }
  }

  function _buyERC1155Ex(
    IElement.ERC1155SellOrder calldata order,
    IElement.Signature calldata signature,
    uint128 amount,
    address receiver,
    bool revertIfIncomplete,
    uint256 value
  ) internal {
    try EXCHANGE.buyERC1155Ex{value: value}(order, signature, receiver, amount, "") {} catch {
      // Revert if specified
      if (revertIfIncomplete) {
        revert UnsuccessfulFill();
      }
    }
  }

  function _buyERC1155sEx(
    IElement.ERC1155SellOrder[] calldata orders,
    IElement.Signature[] calldata signatures,
    uint128[] calldata amounts,
    address receiver,
    bool revertIfIncomplete,
    uint256 value
  ) internal {
    uint256 length = orders.length;

    address[] memory takers = new address[](length);
    for (uint256 i; i < length; ) {
      takers[i] = receiver;
      unchecked {
        ++i;
      }
    }

    // Execute fill
    try
      EXCHANGE.batchBuyERC1155sEx{value: value}(
        orders,
        signatures,
        takers,
        amounts,
        new bytes[](length),
        revertIfIncomplete
      )
    {} catch {
      // Revert if specified
      if (revertIfIncomplete) {
        revert UnsuccessfulFill();
      }
    }
  }
}
