// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC1155} from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";

import {BaseModule} from "../BaseModule.sol";

// Notes:
// - includes common helpers useful for all marketplace/exchange modules

abstract contract BaseExchangeModule is BaseModule {
    using SafeERC20 for IERC20;

    // --- Structs ---

    // Every fill execution has the following parameters:
    // - `fillTo`: the recipient of the received items
    // - `refundTo`: the recipient of any refunds
    // - `revertIfIncomplete`: whether to revert or skip unsuccessful fills

    // The below `ETHListingParams` and `ERC20ListingParams` rely on the
    // off-chain execution encoder to ensure that the orders filled with
    // the passed in listing parameters exactly match (eg. order amounts
    // and payment tokens match).

    struct ETHListingParams {
        address fillTo;
        address refundTo;
        bool revertIfIncomplete;
        // The total amount of ETH to be provided when filling
        uint256 amount;
    }

    struct ERC20ListingParams {
        address fillTo;
        address refundTo;
        bool revertIfIncomplete;
        // The ERC20 payment token for the listings
        IERC20 token;
        // The total amount of `token` to be provided when filling
        uint256 amount;
    }

    struct OfferParams {
        address fillTo;
        address refundTo;
        bool revertIfIncomplete;
    }

    struct Fee {
        address recipient;
        uint256 amount;
    }

    // --- Fields ---

    address public immutable router;

    // --- Errors ---

    error UnsuccessfulFill();

    // --- Constructor ---

    constructor(address routerAddress) {
        router = routerAddress;
    }

    // --- Modifiers ---

    modifier refundETHLeftover(address refundTo) {
        _;

        uint256 leftover = address(this).balance;
        if (leftover > 0) {
            _sendETH(refundTo, leftover);
        }
    }

    modifier refundERC20Leftover(address refundTo, IERC20 token) {
        _;

        uint256 leftover = token.balanceOf(address(this));
        if (leftover > 0) {
            token.safeTransfer(refundTo, leftover);
        }
    }

    modifier chargeETHFees(Fee[] calldata fees, uint256 amount) {
        if (fees.length == 0) {
            _;
        } else {
            uint256 balanceBefore = address(this).balance;

            _;

            uint256 length = fees.length;
            if (length > 0) {
                uint256 balanceAfter = address(this).balance;
                uint256 actualPaid = balanceBefore - balanceAfter;

                uint256 actualFee;
                for (uint256 i = 0; i < length; ) {
                    // Adjust the fee to what was actually paid
                    actualFee = (fees[i].amount * actualPaid) / amount;
                    if (actualFee > 0) {
                        _sendETH(fees[i].recipient, actualFee);
                    }

                    unchecked {
                        ++i;
                    }
                }
            }
        }
    }

    modifier chargeERC20Fees(
        Fee[] calldata fees,
        IERC20 token,
        uint256 amount
    ) {
        if (fees.length == 0) {
            _;
        } else {
            uint256 balanceBefore = token.balanceOf(address(this));

            _;

            uint256 length = fees.length;
            if (length > 0) {
                uint256 balanceAfter = token.balanceOf(address(this));
                uint256 actualPaid = balanceBefore - balanceAfter;

                uint256 actualFee;
                for (uint256 i = 0; i < length; ) {
                    // Adjust the fee to what was actually paid
                    actualFee = (fees[i].amount * actualPaid) / amount;
                    if (actualFee > 0) {
                        token.safeTransfer(fees[i].recipient, actualFee);
                    }

                    unchecked {
                        ++i;
                    }
                }
            }
        }
    }

    // --- Helpers ---

    function _sendAllETH(address to) internal {
        _sendETH(to, address(this).balance);
    }

    function _sendAllERC20(address to, IERC20 token) internal {
        uint256 balance = token.balanceOf(address(this));
        if (balance > 0) {
            token.safeTransfer(to, balance);
        }
    }

    function _sendAllERC721(
        address to,
        IERC721 token,
        uint256 tokenId
    ) internal {
        if (token.ownerOf(tokenId) == address(this)) {
            token.safeTransferFrom(address(this), to, tokenId);
        }
    }

    function _sendAllERC1155(
        address to,
        IERC1155 token,
        uint256 tokenId
    ) internal {
        uint256 balance = token.balanceOf(address(this), tokenId);
        if (balance > 0) {
            token.safeTransferFrom(address(this), to, tokenId, balance, "");
        }
    }

    function _approveERC20IfNeeded(
        IERC20 token,
        address spender,
        uint256 amount
    ) internal {
        uint256 allowance = token.allowance(address(this), spender);
        if (allowance < amount) {
            token.approve(spender, amount - allowance);
        }
    }

    function _approveERC721IfNeeded(IERC721 token, address operator) internal {
        bool isApproved = token.isApprovedForAll(address(this), operator);
        if (!isApproved) {
            token.setApprovalForAll(operator, true);
        }
    }

    function _approveERC1155IfNeeded(IERC1155 token, address operator)
        internal
    {
        bool isApproved = token.isApprovedForAll(address(this), operator);
        if (!isApproved) {
            token.setApprovalForAll(operator, true);
        }
    }
}
