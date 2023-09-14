// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

import {BaseExchangeModule} from "./BaseExchangeModule.sol";
import {BaseModule} from "../BaseModule.sol";
import {IZora} from "../../../interfaces/IZora.sol";

// Notes:
// - supports filling "asks"

contract ZoraModule is BaseExchangeModule {
  // --- Structs ---

  struct Ask {
    IERC721 collection;
    uint256 tokenId;
    address currency;
    uint256 amount;
    address finder;
  }

  // --- Fields ---

  IZora public immutable EXCHANGE;

  // --- Constructor ---

  constructor(
    address owner,
    address router,
    address exchange
  ) BaseModule(owner) BaseExchangeModule(router) {
    EXCHANGE = IZora(exchange);
  }

  // --- Fallback ---

  receive() external payable {}

  // --- Single ETH listing ---

  function acceptETHListing(
    Ask calldata ask,
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
    _buy(ask, params.fillTo, params.revertIfIncomplete);
  }

  // --- Multiple ETH listings ---

  function acceptETHListings(
    Ask[] calldata asks,
    ETHListingParams calldata params,
    Fee[] calldata fees
  )
    external
    payable
    nonReentrant
    refundETHLeftover(params.refundTo)
    chargeETHFees(fees, params.amount)
  {
    // Foundation does not support batch filling so we fill orders one by one
    for (uint256 i = 0; i < asks.length; ) {
      _buy(asks[i], params.fillTo, params.revertIfIncomplete);

      unchecked {
        ++i;
      }
    }
  }

  // --- Single ERC20 listing ---

  function acceptERC20Listing(
    Ask calldata ask,
    ERC20ListingParams calldata params,
    Fee[] calldata fees
  )
    external
    payable
    nonReentrant
    refundERC20Leftover(params.refundTo, params.token)
    chargeERC20Fees(fees, params.token, params.amount)
  {
    // Execute fill
    _buy(ask, params.fillTo, params.revertIfIncomplete);
  }

  // --- Multiple ERC20 listings ---

  function acceptERC20Listings(
    Ask[] calldata asks,
    ERC20ListingParams calldata params,
    Fee[] calldata fees
  )
    external
    payable
    nonReentrant
    refundERC20Leftover(params.refundTo, params.token)
    chargeERC20Fees(fees, params.token, params.amount)
  {
    // Foundation does not support batch filling so we fill orders one by one
    for (uint256 i = 0; i < asks.length; ) {
      _buy(asks[i], params.fillTo, params.revertIfIncomplete);

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

  function _buy(Ask calldata ask, address receiver, bool revertIfIncomplete) internal {
    // Execute fill
    try
      EXCHANGE.fillAsk{value: ask.currency == address(0) ? ask.amount : 0}(
        address(ask.collection),
        ask.tokenId,
        ask.currency,
        ask.amount,
        ask.finder
      )
    {
      ask.collection.safeTransferFrom(address(this), receiver, ask.tokenId);
    } catch {
      // Revert if specified
      if (revertIfIncomplete) {
        revert UnsuccessfulFill();
      }
    }
  }
}
