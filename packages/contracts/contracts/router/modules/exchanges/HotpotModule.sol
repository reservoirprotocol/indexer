// SPDX-License-Identifier: MIT

pragma solidity ^0.8.19;

import {BaseExchangeModule} from "./BaseExchangeModule.sol";
import {BaseModule} from "../BaseModule.sol";
import "../../../interfaces/IHotpotMarketplace.sol";

// Notes:
// - supports filling listings (both ERC721/ERC1155 but only ETH-denominated)

contract HotpotModule is BaseExchangeModule {

    IHotpotMarketplace public immutable EXCHANGE;

    // --- Constructor ---

    constructor(
        address _owner,
        address _router,
        address _exchange
    ) BaseModule(_owner) BaseExchangeModule(_router) {
      EXCHANGE = IHotpotMarketplace(_exchange);  
    } 

    // --- Fallback ---

    receive() external payable {}

    // --- Single ETH listing ---

    function acceptETHListing(
        IHotpotMarketplace.OrderParameters calldata order,
        ETHListingParams calldata params,
        Fee[] calldata fees
    )
        external
        payable
        nonReentrant
        refundETHLeftover(params.refundTo)
        chargeETHFees(fees, params.amount)
    {
        _fulfillOrder(
            order,
            params.amount
        );
    }

    function acceptETHListings(
        IHotpotMarketplace.OrderParameters[] calldata parameters,
        ETHListingParams calldata params,
        Fee[] calldata fees
    )
        external
        payable
        nonReentrant
        refundETHLeftover(params.refundTo)
        chargeETHFees(fees, params.amount) 
    {
        EXCHANGE.batchFulfillOrder{value: params.amount}(parameters);
    }

    // --- Internal ---

    function _fulfillOrder(
        IHotpotMarketplace.OrderParameters calldata order,
        uint256 value
    ) internal {
        EXCHANGE.fulfillOrder{value: value}(order);
    }
}