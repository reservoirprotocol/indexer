// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {BaseModule} from "./BaseModule.sol";
import {IWETH} from "../../interfaces/IWETH.sol";

// Utility module for wrapping/unwrpping ETH/WETH.
contract WETHModule is BaseModule {
    // --- Fields ---

    IWETH public constant WETH =
        IWETH(0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2);

    // --- Constructor ---

    constructor(address owner) BaseModule(owner) {}

    // --- Fallback ---

    receive() external payable {}

    // --- Wrap ---

    function wrap(address receiver) external payable nonReentrant {
        WETH.deposit{value: msg.value}();
        _sendERC20(receiver, msg.value, WETH);
    }

    // --- Unwrap ---

    function unwrap(address receiver) external nonReentrant {
        uint256 balance = WETH.balanceOf(address(this));
        WETH.withdraw(balance);
        _sendETH(receiver, balance);
    }
}
