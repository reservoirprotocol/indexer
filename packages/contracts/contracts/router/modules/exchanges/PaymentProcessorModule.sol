// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC1155} from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";

import {BaseExchangeModule} from "./BaseExchangeModule.sol";
import {BaseModule} from "../BaseModule.sol";

import {IPaymentProcessor} from "../../../interfaces/IPaymentProcessor.sol";

// Notes:
// - supports filling listings (both ETH and ERC20)
// - supports filling offers

contract PaymentProcessorModule is BaseExchangeModule {
  // --- Fields ---

  IPaymentProcessor public immutable EXCHANGE;

  // --- Constructor ---

  constructor(
    address owner,
    address router,
    address exchange
  ) BaseModule(owner) BaseExchangeModule(router) {
    EXCHANGE = IPaymentProcessor(exchange);
  }

  // --- Fallback ---

  receive() external payable {}

  // --- Single ETH listing ---

  function acceptETHListings(
    IPaymentProcessor.MatchedOrder[] memory saleDetails,
    IPaymentProcessor.SignatureECDSA[] memory signedListings,
    ETHListingParams calldata params,
    Fee[] calldata fees
  )
    external
    payable
    nonReentrant
    refundETHLeftover(params.refundTo)
    chargeETHFees(fees, params.amount)
  {
    uint256 length = saleDetails.length;
    for (uint256 i; i < length; ) {
      // Execute the fill
      try
        EXCHANGE.buySingleListing{value: saleDetails[i].offerPrice}(
          saleDetails[i],
          signedListings[i],
          IPaymentProcessor.SignatureECDSA({v: 0, r: bytes32(0), s: bytes32(0)})
        )
      {
        // Forward any token to the specified receiver
        if (saleDetails[i].protocol == IPaymentProcessor.TokenProtocols.ERC721) {
          IERC721(saleDetails[i].tokenAddress).safeTransferFrom(
            address(this),
            params.fillTo,
            saleDetails[i].tokenId
          );
        } else {
          IERC1155(saleDetails[i].tokenAddress).safeTransferFrom(
            address(this),
            params.fillTo,
            saleDetails[i].tokenId,
            saleDetails[i].amount,
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
    IPaymentProcessor.MatchedOrder[] memory saleDetails,
    IPaymentProcessor.SignatureECDSA[] memory signedListings,
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

    uint256 length = saleDetails.length;
    for (uint256 i; i < length; ) {
      // Execute the fill
      try
        EXCHANGE.buySingleListing(
          saleDetails[i],
          signedListings[i],
          IPaymentProcessor.SignatureECDSA({v: 0, r: bytes32(0), s: bytes32(0)})
        )
      {
        // Forward any token to the specified receiver
        if (saleDetails[i].protocol == IPaymentProcessor.TokenProtocols.ERC721) {
          IERC721(saleDetails[i].tokenAddress).safeTransferFrom(
            address(this),
            params.fillTo,
            saleDetails[i].tokenId
          );
        } else {
          IERC1155(saleDetails[i].tokenAddress).safeTransferFrom(
            address(this),
            params.fillTo,
            saleDetails[i].tokenId,
            saleDetails[i].amount,
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
    IPaymentProcessor.MatchedOrder[] memory saleDetails,
    IPaymentProcessor.SignatureECDSA[] memory signedOffers,
    OfferParams calldata params,
    Fee[] calldata fees
  ) external nonReentrant {
    uint256 length = saleDetails.length;
    for (uint256 i; i < length; ) {
      // Approve the exchange if needed
      if (saleDetails[i].protocol == IPaymentProcessor.TokenProtocols.ERC721) {
        _approveERC721IfNeeded(IERC721(saleDetails[i].tokenAddress), address(EXCHANGE));
      } else {
        _approveERC1155IfNeeded(IERC1155(saleDetails[i].tokenAddress), address(EXCHANGE));
      }

      // Execute the fill
      try
        EXCHANGE.buySingleListing(
          saleDetails[i],
          IPaymentProcessor.SignatureECDSA({v: 0, r: bytes32(0), s: bytes32(0)}),
          signedOffers[i]
        )
      {
        // Pay fees
        uint256 feesLength = fees.length;
        for (uint256 j; j < feesLength; ) {
          Fee memory fee = fees[j];
          _sendERC20(fee.recipient, fee.amount, IERC20(saleDetails[i].paymentCoin));

          unchecked {
            ++j;
          }
        }

        // Forward any left payment to the specified receiver
        _sendAllERC20(params.fillTo, IERC20(saleDetails[i].paymentCoin));
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
}
