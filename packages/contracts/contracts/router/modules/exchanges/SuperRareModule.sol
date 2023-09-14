// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

import {BaseExchangeModule} from "./BaseExchangeModule.sol";
import {BaseModule} from "../BaseModule.sol";
import {ISuperRare} from "../../../interfaces/ISuperRare.sol";

// Notes:
// - only supports filling "buy now" listings (ERC721 and ETH-denominated)

contract SuperRareModule is BaseExchangeModule {
  // --- Structs ---

  struct Listing {
    IERC721 token;
    uint256 tokenId;
    address currency;
    uint256 price;
    uint256 priceWithFees;
  }

  // --- Fields ---

  ISuperRare public immutable BAZAAR;

  // --- Constructor ---

  constructor(
    address owner,
    address router,
    address bazaar
  ) BaseModule(owner) BaseExchangeModule(router) {
    BAZAAR = ISuperRare(bazaar);
  }

  // --- Fallback ---

  receive() external payable {}

  // --- Single ETH listing ---

  function acceptETHListing(
    Listing calldata listing,
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
      listing.token,
      listing.tokenId,
      listing.currency,
      listing.price,
      params.fillTo,
      params.revertIfIncomplete,
      listing.priceWithFees
    );
  }

  // --- Multiple ETH listings ---

  function acceptETHListings(
    Listing[] calldata listings,
    ETHListingParams calldata params,
    Fee[] calldata fees
  )
    external
    payable
    nonReentrant
    refundETHLeftover(params.refundTo)
    chargeETHFees(fees, params.amount)
  {
    uint256 length = listings.length;
    for (uint256 i = 0; i < length; ) {
      _buy(
        listings[i].token,
        listings[i].tokenId,
        listings[i].currency,
        listings[i].price,
        params.fillTo,
        params.revertIfIncomplete,
        listings[i].priceWithFees
      );

      unchecked {
        ++i;
      }
    }
  }

  // --- ERC721 hooks ---

  function onERC721Received(
    address, // operator,
    address, // from
    uint256, // tokenId,
    bytes calldata // data
  ) external pure returns (bytes4) {
    return this.onERC721Received.selector;
  }

  // --- Internal ---

  function _buy(
    IERC721 token,
    uint256 tokenId,
    address currency,
    uint256 price,
    address receiver,
    bool revertIfIncomplete,
    uint256 value
  ) internal {
    // Execute fill
    try BAZAAR.buy{value: value}(token, tokenId, currency, price) {
      token.safeTransferFrom(address(this), receiver, tokenId);
    } catch {
      // Revert if specified
      if (revertIfIncomplete) {
        revert UnsuccessfulFill();
      }
    }
  }
}
