// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {IERC1155} from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

import {BaseExchangeModule} from "./BaseExchangeModule.sol";
import {BaseModule} from "../BaseModule.sol";
import {ILooksRareV2, ITransferManager} from "../../../interfaces/ILooksRareV2.sol";

// Notes:
// - supports filling listings (both ERC721/ERC1155 but only ETH-denominated)
// - supports filling offers (both ERC721/ERC1155)

contract LooksRareV2Module is BaseExchangeModule {
  using SafeERC20 for IERC20;

  // --- Fields ---

  ILooksRareV2 public immutable EXCHANGE;

  ITransferManager public immutable TRANSFER_MANAGER;

  // --- Constructor ---

  constructor(
    address owner,
    address router,
    address exchange
  ) BaseModule(owner) BaseExchangeModule(router) {
    EXCHANGE = ILooksRareV2(exchange);
    TRANSFER_MANAGER = EXCHANGE.transferManager();

    // Grant approval to the transfer manager
    address[] memory operators = new address[](1);
    operators[0] = address(EXCHANGE);
    TRANSFER_MANAGER.grantApprovals(operators);
  }

  // --- Fallback ---

  receive() external payable {}

  // --- Single ETH listing ---

  function acceptETHListing(
    ILooksRareV2.MakerOrder calldata makerAsk,
    bytes calldata makerSignature,
    ILooksRareV2.MerkleTree calldata merkleTree,
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
    _buy(
      makerAsk,
      makerSignature,
      merkleTree,
      params.fillTo,
      params.revertIfIncomplete,
      params.amount
    );
  }

  // --- Multiple ETH listings ---

  function acceptETHListings(
    ILooksRareV2.MakerOrder[] calldata makerAsks,
    bytes[] calldata makerSignatures,
    ILooksRareV2.MerkleTree[] calldata merkleTrees,
    ETHListingParams calldata params,
    Fee[] calldata fees
  )
    external
    payable
    nonReentrant
    refundETHLeftover(params.refundTo)
    chargeETHFees(fees, params.amount)
  {
    // LooksRare does not support batch filling so we fill orders one by one
    for (uint256 i = 0; i < makerAsks.length; ) {
      // Execute fill
      _buy(
        makerAsks[i],
        makerSignatures[i],
        merkleTrees[i],
        params.fillTo,
        params.revertIfIncomplete,
        makerAsks[i].price
      );

      unchecked {
        ++i;
      }
    }
  }

  // --- [ERC721] Single offer ---

  function acceptERC721Offer(
    ILooksRareV2.MakerOrder calldata makerBid,
    bytes calldata takerAdditionalParameters,
    bytes calldata makerSignature,
    ILooksRareV2.MerkleTree calldata merkleTree,
    OfferParams calldata params,
    Fee[] calldata fees
  ) external nonReentrant {
    IERC721 collection = IERC721(address(makerBid.collection));

    // Approve the transfer manager if needed
    _approveERC721IfNeeded(collection, address(TRANSFER_MANAGER));

    // Execute the fill
    uint256 tokenId = _sell(
      makerBid,
      takerAdditionalParameters,
      makerSignature,
      merkleTree,
      params.fillTo,
      params.revertIfIncomplete,
      fees
    );

    // Refund any ERC721 leftover
    _sendAllERC721(params.refundTo, collection, tokenId);
  }

  // --- [ERC1155] Single offer ---

  function acceptERC1155Offer(
    ILooksRareV2.MakerOrder calldata makerBid,
    bytes calldata takerAdditionalParameters,
    bytes calldata makerSignature,
    ILooksRareV2.MerkleTree calldata merkleTree,
    OfferParams calldata params,
    Fee[] calldata fees
  ) external nonReentrant {
    IERC1155 collection = IERC1155(address(makerBid.collection));

    // Approve the transfer manager if needed
    _approveERC1155IfNeeded(collection, address(TRANSFER_MANAGER));

    // Execute the fill
    uint256 tokenId = _sell(
      makerBid,
      takerAdditionalParameters,
      makerSignature,
      merkleTree,
      params.fillTo,
      params.revertIfIncomplete,
      fees
    );

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

  function _buy(
    ILooksRareV2.MakerOrder calldata makerAsk,
    bytes calldata makerSignature,
    ILooksRareV2.MerkleTree calldata merkleTree,
    address receiver,
    bool revertIfIncomplete,
    uint256 value
  ) internal {
    ILooksRareV2.TakerOrder memory takerBid;
    takerBid.recipient = receiver;

    // Execute the fill
    try
      EXCHANGE.executeTakerBid{value: value}(
        takerBid,
        makerAsk,
        makerSignature,
        merkleTree,
        address(0)
      )
    {} catch {
      // Revert if specified
      if (revertIfIncomplete) {
        revert UnsuccessfulFill();
      }
    }
  }

  function _sell(
    ILooksRareV2.MakerOrder calldata makerBid,
    bytes calldata takerAdditionalParameters,
    bytes calldata makerSignature,
    ILooksRareV2.MerkleTree calldata merkleTree,
    address receiver,
    bool revertIfIncomplete,
    Fee[] calldata fees
  ) internal returns (uint256 tokenId) {
    ILooksRareV2.TakerOrder memory takerAsk;
    takerAsk.recipient = address(this);
    takerAsk.additionalParameters = takerAdditionalParameters;

    // Execute the fill
    try EXCHANGE.executeTakerAsk(takerAsk, makerBid, makerSignature, merkleTree, address(0)) {
      // Pay fees
      uint256 feesLength = fees.length;
      for (uint256 i; i < feesLength; ) {
        Fee memory fee = fees[i];
        _sendERC20(fee.recipient, fee.amount, makerBid.currency);

        unchecked {
          ++i;
        }
      }

      // Forward any left payment to the specified receiver
      _sendAllERC20(receiver, makerBid.currency);
    } catch {
      // Revert if specified
      if (revertIfIncomplete) {
        revert UnsuccessfulFill();
      }
    }

    tokenId = abi.decode(takerAdditionalParameters[0:32], (uint256));
  }
}
