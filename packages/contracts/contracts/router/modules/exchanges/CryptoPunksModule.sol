// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

import {BaseExchangeModule} from "./BaseExchangeModule.sol";
import {BaseModule} from "../BaseModule.sol";
import {ICryptoPunksMarket} from "../../../interfaces/ICryptoPunksMarket.sol";

contract CryptoPunksModule is BaseExchangeModule {
  // --- Fields ---

  ICryptoPunksMarket public immutable MARKETPLACE;

  // --- Constructor ---

  constructor(
    address owner,
    address router,
    address marketplace
  ) BaseModule(owner) BaseExchangeModule(router) {
    MARKETPLACE = ICryptoPunksMarket(marketplace);
  }

  // --- Fallback ---

  receive() external payable {}

  // --- Multiple buy Punks ---

  function batchBuyPunksWithETH(
    ICryptoPunksMarket.BuyOrder[] calldata buyOrders,
    ETHListingParams calldata params,
    Fee[] calldata fees
  )
    external
    payable
    nonReentrant
    refundETHLeftover(params.refundTo)
    chargeETHFees(fees, params.amount)
  {
    uint256 length = buyOrders.length;
    for (uint256 i = 0; i < length; ) {
      // Execute fill
      _buy(buyOrders[i], params.revertIfIncomplete);

      unchecked {
        ++i;
      }
    }
  }

  function _buy(ICryptoPunksMarket.BuyOrder calldata buyOrder, bool revertIfIncomplete) internal {
    try MARKETPLACE.buyPunk{value: buyOrder.price}(buyOrder.punkIndex) {
      // Transfer the punk to the receiver
      MARKETPLACE.transferPunk(buyOrder.buyer, buyOrder.punkIndex);
    } catch {
      // Revert if specified
      if (revertIfIncomplete) {
        revert UnsuccessfulFill();
      }
    }
  }
}
