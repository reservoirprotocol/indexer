// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC1155} from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";

import {BaseExchangeModule} from "./BaseExchangeModule.sol";
import {BaseModule} from "../BaseModule.sol";
import {IPaymentProcessor} from "../../../interfaces/IPaymentProcessor.sol";

// Notes:
// - only supports filling listings (ETH-denominated)

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

  // --- ERC1271 ---

  function isValidSignature(bytes32, bytes memory) external pure returns (bytes4) {
    return this.isValidSignature.selector;
  }

  // --- ERC721 / ERC1155 hooks ---

  function onERC721Received(
    address, // operator,
    address, // from
    uint256, // tokenId,
    bytes calldata // data
  ) external pure returns (bytes4) {
    return this.onERC721Received.selector;
  }

  function onERC1155Received(
    address, // operator
    address, // from
    uint256, // tokenId
    uint256, // amount
    bytes calldata // data
  ) external pure returns (bytes4) {
    return this.onERC1155Received.selector;
  }
}
