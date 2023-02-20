// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {BaseExchangeModule} from "./BaseExchangeModule.sol";
import {BaseModule} from "../BaseModule.sol";
import {IUniswapV3Router} from "../../../interfaces/IUniswapV3Router.sol";

// Notes:
// - supports swapping ETH and ERC20 to any token via a direct path

contract UniswapV3Module is BaseExchangeModule {
    // --- Fields ---

    address public constant WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;

    IUniswapV3Router public constant SWAP_ROUTER =
        IUniswapV3Router(0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45);

    // --- Constructor ---

    constructor(address owner, address router)
        BaseModule(owner)
        BaseExchangeModule(router)
    {}

    // --- Fallback ---

    receive() external payable {}

    // --- Swaps ---

    function ethToExactOutput(
        IUniswapV3Router.ExactOutputSingleParams calldata params,
        address refundTo
    ) external payable refundETHLeftover(refundTo) {
        if (
            address(params.tokenIn) != WETH ||
            msg.value != params.amountInMaximum
        ) {
            revert WrongParams();
        }

        // Execute the swap
        SWAP_ROUTER.exactOutputSingle{value: msg.value}(params);

        // Refund any ETH stucked in the router
        SWAP_ROUTER.refundETH();
    }

    function erc20ToExactOutput(
        IUniswapV3Router.ExactOutputSingleParams calldata params,
        address refundTo
    ) external refundERC20Leftover(refundTo, params.tokenIn) {
        // Approve the router if needed
        _approveERC20IfNeeded(
            params.tokenIn,
            address(SWAP_ROUTER),
            params.amountInMaximum
        );

        // Execute the swap
        SWAP_ROUTER.exactOutputSingle(params);
    }
}
