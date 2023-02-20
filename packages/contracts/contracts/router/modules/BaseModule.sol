// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {TwoStepOwnable} from "../../misc/TwoStepOwnable.sol";

// Notes:
// - includes common helpers useful for all modules

abstract contract BaseModule is TwoStepOwnable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // --- Events ---

    event CallExecuted(address target, bytes data, uint256 value);

    // --- Errors ---

    error UnsuccessfulCall();
    error UnsuccessfulPayment();
    error WrongParams();

    // --- Constructor ---

    constructor(address owner) TwoStepOwnable(owner) {}

    // --- Owner ---

    // To be able to recover anything that gets stucked by mistake in the module,
    // we allow the owner to perform any arbitrary call. Since the goal is to be
    // stateless, this should only happen in case of mistakes. In addition, this
    // method is also useful for withdrawing any earned trading rewards.
    function makeCalls(
        address[] calldata targets,
        bytes[] calldata data,
        uint256[] calldata values
    ) external payable onlyOwner nonReentrant {
        uint256 length = targets.length;
        for (uint256 i = 0; i < length; ) {
            _makeCall(targets[i], data[i], values[i]);
            emit CallExecuted(targets[i], data[i], values[i]);

            unchecked {
                ++i;
            }
        }
    }

    // --- Helpers ---

    function _sendETH(address to, uint256 amount) internal {
        if (amount > 0) {
            (bool success, ) = payable(to).call{value: amount}("");
            if (!success) {
                revert UnsuccessfulPayment();
            }
        }
    }

    function _sendERC20(
        address to,
        uint256 amount,
        IERC20 token
    ) internal {
        if (amount > 0) {
            token.safeTransfer(to, amount);
        }
    }

    function _makeCall(
        address target,
        bytes memory data,
        uint256 value
    ) internal {
        (bool success, ) = payable(target).call{value: value}(data);
        if (!success) {
            revert UnsuccessfulCall();
        }
    }
}
