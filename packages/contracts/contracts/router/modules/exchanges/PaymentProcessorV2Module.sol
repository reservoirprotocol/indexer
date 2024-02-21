// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC1155} from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";

import {BaseExchangeModule} from "./BaseExchangeModule.sol";
import {BaseModule} from "../BaseModule.sol";

import {IPaymentProcessorV2} from "../../../interfaces/IPaymentProcessorV2.sol";

// Notes:
// - supports filling listings (both ETH and ERC20)
// - supports filling offers

contract PaymentProcessorV2Module is BaseExchangeModule {
  // --- Fields ---

  IPaymentProcessorV2 public immutable EXCHANGE;

  // --- Constructor ---

  constructor(
    address owner,
    address router,
    address exchange
  ) BaseModule(owner) BaseExchangeModule(router) {
    EXCHANGE = IPaymentProcessorV2(exchange);
  }

  // --- Fallback ---

  receive() external payable {}

  // --- Single ETH listing ---

  function acceptETHListings(
    IPaymentProcessorV2.BuyListingInput[] memory inputs,
    ETHListingParams calldata params,
    Fee[] calldata fees
  )
    external
    payable
    nonReentrant
    refundETHLeftover(params.refundTo)
    chargeETHFees(fees, params.amount)
  {
    uint256 length = inputs.length;
    for (uint256 i; i < length; ) {
      IPaymentProcessorV2.Order memory saleDetails = inputs[i].saleDetails;
      IPaymentProcessorV2.OrderProtocols protocol = saleDetails.protocol;
      address tokenAddress = saleDetails.tokenAddress;
      uint256 tokenId = saleDetails.tokenId;
      uint256 amount = saleDetails.amount;
      // Execute the fill
      try
        EXCHANGE.buyListing{value: params.amount}(
          encodeBuyListingCalldata(inputs[i])
        )
      {
        // Forward any token to the specified receiver
        if (protocol == IPaymentProcessorV2.OrderProtocols.ERC721_FILL_OR_KILL) {
          IERC721(tokenAddress).safeTransferFrom(
            address(this),
            params.fillTo,
            tokenId
          );
        } else {
          IERC1155(tokenAddress).safeTransferFrom(
            address(this),
            params.fillTo,
            tokenId,
            amount,
            ""
          );
        }
      } catch {
        // Revert if specified
        if (params.revertIfIncomplete) {
          revert UnsuccessfulFill();
        }
      }

      unchecked {
        ++i;
      }
    }
  }

  function acceptERC20Listings(
    IPaymentProcessorV2.BuyListingInput[] memory inputs,
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

    uint256 length = inputs.length;
    for (uint256 i; i < length; ) {
      IPaymentProcessorV2.Order memory saleDetails = inputs[i].saleDetails;
      IPaymentProcessorV2.OrderProtocols protocol = saleDetails.protocol;
      address tokenAddress = saleDetails.tokenAddress;
      uint256 tokenId = saleDetails.tokenId;
      uint256 amount = saleDetails.amount;

      // Execute the fill
      try
        EXCHANGE.buyListing(
          encodeBuyListingCalldata(inputs[i])
        )
      {
        // Forward any token to the specified receiver
        if (protocol == IPaymentProcessorV2.OrderProtocols.ERC721_FILL_OR_KILL) {
          IERC721(tokenAddress).safeTransferFrom(
            address(this),
            params.fillTo,
            tokenId
          );
        } else {
          IERC1155(tokenAddress).safeTransferFrom(
            address(this),
            params.fillTo,
            tokenId,
            amount,
            ""
          );
        }
      } catch {
        // Revert if specified
        if (params.revertIfIncomplete) {
          revert UnsuccessfulFill();
        }
      }

      unchecked {
        ++i;
      }
    }
  }

  function acceptOffers(
    IPaymentProcessorV2.AcceptOfferInput[] memory inputs,
    OfferParams calldata params,
    Fee[] calldata fees
  ) external nonReentrant {
    uint256 length = inputs.length;
    for (uint256 i; i < length; ) {

      IPaymentProcessorV2.Order memory saleDetails = inputs[i].saleDetails;
      IPaymentProcessorV2.OrderProtocols protocol = saleDetails.protocol;
      address tokenAddress = saleDetails.tokenAddress;
      address paymentMethod = saleDetails.paymentMethod;

      // Approve the exchange if needed
       if (protocol == IPaymentProcessorV2.OrderProtocols.ERC721_FILL_OR_KILL) {
        _approveERC721IfNeeded(IERC721(tokenAddress), address(EXCHANGE));
      } else {
        _approveERC1155IfNeeded(IERC1155(tokenAddress), address(EXCHANGE));
      }

      // Execute the fill
      try
        EXCHANGE.acceptOffer(
          encodeAcceptOfferCalldata(inputs[i])
        )
      {
        // Pay fees
        uint256 feesLength = fees.length;
        for (uint256 j; j < feesLength; ) {
          Fee memory fee = fees[j];
          _sendERC20(fee.recipient, fee.amount, IERC20(paymentMethod));

          unchecked {
            ++j;
          }
        }

        // Forward any left payment to the specified receiver
        _sendAllERC20(params.fillTo, IERC20(paymentMethod));
      } catch {
        // Revert if specified
        if (params.revertIfIncomplete) {
          revert UnsuccessfulFill();
        }
      }

      unchecked {
        ++i;
      }
    }
  }

  // --- ERC1271 ---

  function isValidSignature(bytes32, bytes memory) external pure returns (bytes4) {
    return this.isValidSignature.selector;
  }

  // --- ERC721 / ERC1155 hooks ---

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

  function encodeBuyListingCalldata(
    IPaymentProcessorV2.BuyListingInput memory input
  ) private view returns (bytes memory) {
    return _removeFirst4Bytes(
      abi.encodeWithSignature(
        "buyListing(bytes32,(uint8,address,address,address,address,address,address,uint256,uint248,uint256,uint256,uint256,uint256,uint256,uint248,uint248),(uint8,bytes32,bytes32),(address,address,uint256,uint8,bytes32,bytes32),(address,uint256))",
        input.domainSeparator,
        input.saleDetails,
        input.signature,
        input.cosignature,
        input.feeOnTop
      )
    );
  }

  function encodeAcceptOfferCalldata(
    IPaymentProcessorV2.AcceptOfferInput memory input
  ) private view returns (bytes memory) {
    return _removeFirst4Bytes(
      abi.encodeWithSignature(
        "acceptOffer(bytes32,bool,(uint8,address,address,address,address,address,address,uint256,uint248,uint256,uint256,uint256,uint256,uint256,uint248,uint248),(uint8,bytes32,bytes32),(bytes32,bytes32[]),(address,address,uint256,uint8,bytes32,bytes32),(address,uint256))",
        input.domainSeparator,
        input.isCollectionLevelOffer,
        input.saleDetails,
        input.signature,
        input.tokenSetProof,
        input.cosignature,
        input.feeOnTop
      )
    );
  }

  function _removeFirst4Bytes(bytes memory data) private view returns (bytes memory result) {
    assembly {
      if lt(mload(data), 0x04) {
        revert(0,0)
      }
      mstore(result, sub(mload(data), 0x04))
      if iszero(staticcall(gas(), 0x04, add(data, 0x24), mload(result), add(result, 0x20), mload(result))){
        revert(0,0)
      }
    }
  }
}
