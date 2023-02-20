// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {BaseExchangeModule} from "./BaseExchangeModule.sol";
import {BaseModule} from "../BaseModule.sol";
import {IUniswapV3Router} from "../../../interfaces/IUniswapV3Router.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IWETH} from "../../../interfaces/IWETH.sol";

// Notes:
// - supports swapping ETH and ERC20 to any token via a direct path

contract SwapModule is BaseExchangeModule {

    struct TrasnferDetail {
        address recipient;
        bool toETH;
        uint256 amount;
    }

    struct Swap {
        IUniswapV3Router.ExactOutputSingleParams params;
        TrasnferDetail[] recipients;
    }

    // --- Fields ---

    IWETH public constant WETH = IWETH(0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2);

    IUniswapV3Router public constant SWAP_ROUTER =
        IUniswapV3Router(0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45);

    // --- Constructor ---

    constructor(address owner, address router)
        BaseModule(owner)
        BaseExchangeModule(router)
    {}

    // --- Fallback ---

    receive() external payable {}

    
    // --- Wrap ---

    function wrap(TrasnferDetail[] calldata targets) external payable nonReentrant {
        WETH.deposit{value: msg.value}();
        for (uint256 i = 0; i < targets.length; ) {
            _sendERC20(targets[i].recipient, targets[i].amount, WETH);
            unchecked {
                ++i;
            }
        }
    }

    // --- Unwrap ---

    function unwrap(TrasnferDetail[] calldata targets) external nonReentrant {
        uint256 balance = WETH.balanceOf(address(this));
        WETH.withdraw(balance);
        for (uint256 i = 0; i < targets.length; ) {
            _sendETH(targets[i].recipient, targets[i].amount);
            unchecked {
                ++i;
            }
        }
    }

    // --- Swaps ---

    function ethToExactOutput(
        Swap calldata swap,
        address refundTo
    ) external payable refundETHLeftover(refundTo) {
        if (
            address(swap.params.tokenIn) != address(WETH) ||
            msg.value != swap.params.amountInMaximum
        ) {
            revert WrongParams();
        }

        // Execute the swap
        SWAP_ROUTER.exactOutputSingle{value: msg.value}(swap.params);

        // Refund any ETH stucked in the router
        SWAP_ROUTER.refundETH();

        for (uint256 i = 0; i < swap.recipients.length; ) {
            TrasnferDetail calldata transferDetail = swap.recipients[i];
            if (transferDetail.toETH) {
                WETH.withdraw(transferDetail.amount);
                _sendETH(transferDetail.recipient, transferDetail.amount);
            } else {
                _sendERC20(transferDetail.recipient, transferDetail.amount, IERC20(swap.params.tokenOut));
            }
            unchecked {
                ++i;
            }
        }
    }

    function erc20ToExactOutput(
        Swap calldata swap,
        address refundTo
    ) external refundERC20Leftover(refundTo, swap.params.tokenIn) {

        // Approve the router if needed
        _approveERC20IfNeeded(
            swap.params.tokenIn,
            address(SWAP_ROUTER),
            swap.params.amountInMaximum
        );

        // Execute the swap
        SWAP_ROUTER.exactOutputSingle(swap.params);

        for (uint256 i = 0; i < swap.recipients.length; ) {
            TrasnferDetail calldata transferDetail = swap.recipients[i];
            if (transferDetail.toETH) {
                WETH.withdraw(transferDetail.amount);
                _sendETH(transferDetail.recipient, transferDetail.amount);
            } else {
                _sendERC20(transferDetail.recipient, transferDetail.amount, IERC20(swap.params.tokenOut));
            }
            unchecked {
                ++i;
            }
        }
    }
}
