// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {BaseExchangeModule} from "./BaseExchangeModule.sol";
import {BaseModule} from "../BaseModule.sol";
import {IUniswapV3Router} from "../../../interfaces/IUniswapV3Router.sol";
import {IWETH} from "../../../interfaces/IWETH.sol";

// Notes:
// - supports swapping ETH and ERC20 to any token via a direct path

contract SwapModule is BaseExchangeModule {
  struct TransferDetail {
    address recipient;
    uint256 amount;
    bool toETH;
  }

  struct BuySwap {
    IUniswapV3Router.ExactOutputSingleParams params;
    TransferDetail[] transfers;
  }

  struct SellSwap {
    IUniswapV3Router.ExactInputSingleParams params;
    TransferDetail[] transfers;
  }

  // --- Fields ---

  IWETH public immutable WETH;
  IUniswapV3Router public immutable SWAP_ROUTER;

  // --- Constructor ---

  constructor(
    address owner,
    address router,
    address weth,
    address swapRouter
  ) BaseModule(owner) BaseExchangeModule(router) {
    WETH = IWETH(weth);
    SWAP_ROUTER = IUniswapV3Router(swapRouter);
  }

  // --- Fallback ---

  receive() external payable {}

  // --- Wrap ---

  function wrap(TransferDetail[] calldata targets) external payable nonReentrant {
    WETH.deposit{value: msg.value}();

    uint256 length = targets.length;
    for (uint256 i = 0; i < length; ) {
      // Zero represents "everything"
      uint256 amount = targets[i].amount == 0 ? WETH.balanceOf(address(this)) : targets[i].amount;
      _sendERC20(targets[i].recipient, amount, WETH);

      unchecked {
        ++i;
      }
    }
  }

  // --- Unwrap ---

  function unwrap(TransferDetail[] calldata targets) external nonReentrant {
    uint256 balance = WETH.balanceOf(address(this));
    WETH.withdraw(balance);

    uint256 length = targets.length;
    for (uint256 i = 0; i < length; ) {
      // Zero represents "everything"
      uint256 amount = targets[i].amount == 0 ? address(this).balance : targets[i].amount;
      _sendETH(targets[i].recipient, amount);

      unchecked {
        ++i;
      }
    }
  }

  // --- Swaps ---

  function ethToExactOutput(
    // Assumes all swaps have the same token in
    BuySwap[] calldata swaps,
    address refundTo,
    bool revertIfIncomplete
  ) external payable nonReentrant refundETHLeftover(refundTo) {
    uint256 swapsLength = swaps.length;
    for (uint256 i; i < swapsLength; ) {
      BuySwap calldata swap = swaps[i];

      // Execute the swap
      try SWAP_ROUTER.exactOutputSingle{value: swap.params.amountInMaximum}(swap.params) {
        uint256 length = swap.transfers.length;
        for (uint256 j = 0; j < length; ) {
          TransferDetail calldata transferDetail = swap.transfers[j];
          if (transferDetail.toETH) {
            // Zero represents "everything"
            uint256 amount = transferDetail.amount == 0
              ? WETH.balanceOf(address(this))
              : transferDetail.amount;

            WETH.withdraw(amount);
            _sendETH(transferDetail.recipient, amount);
          } else {
            // Zero represents "everything"
            uint256 amount = transferDetail.amount == 0
              ? IERC20(swap.params.tokenOut).balanceOf(address(this))
              : transferDetail.amount;

            _sendERC20(transferDetail.recipient, amount, IERC20(swap.params.tokenOut));
          }

          unchecked {
            ++j;
          }
        }
      } catch {
        if (revertIfIncomplete) {
          revert UnsuccessfulFill();
        }
      }

      unchecked {
        ++i;
      }
    }

    // Refund any ETH stucked in the router
    SWAP_ROUTER.refundETH();
  }

  function erc20ToExactOutput(
    // Assumes all swaps have the same token in
    BuySwap[] calldata swaps,
    address refundTo,
    bool revertIfIncomplete
  ) external nonReentrant refundERC20Leftover(refundTo, swaps[0].params.tokenIn) {
    uint256 swapsLength = swaps.length;
    for (uint256 i; i < swapsLength; ) {
      BuySwap calldata swap = swaps[i];

      // Approve the router if needed
      _approveERC20IfNeeded(swap.params.tokenIn, address(SWAP_ROUTER), swap.params.amountInMaximum);

      // Execute the swap
      try SWAP_ROUTER.exactOutputSingle(swap.params) {
        uint256 transfersLength = swap.transfers.length;
        for (uint256 j = 0; j < transfersLength; ) {
          TransferDetail calldata transferDetail = swap.transfers[j];
          if (transferDetail.toETH) {
            // Zero represents "everything"
            uint256 amount = transferDetail.amount == 0
              ? WETH.balanceOf(address(this))
              : transferDetail.amount;

            WETH.withdraw(amount);
            _sendETH(transferDetail.recipient, amount);
          } else {
            // Zero represents "everything"
            uint256 amount = transferDetail.amount == 0
              ? IERC20(swap.params.tokenOut).balanceOf(address(this))
              : transferDetail.amount;

            _sendERC20(transferDetail.recipient, amount, IERC20(swap.params.tokenOut));
          }

          unchecked {
            ++j;
          }
        }
      } catch {
        if (revertIfIncomplete) {
          revert UnsuccessfulFill();
        }
      }

      unchecked {
        ++i;
      }
    }
  }

  function erc20ToExactInput(
    // Assumes all swaps have the same token in
    SellSwap[] calldata swaps,
    address refundTo,
    bool revertIfIncomplete
  ) external nonReentrant refundERC20Leftover(refundTo, swaps[0].params.tokenIn) {
    uint256 swapsLength = swaps.length;
    for (uint256 i; i < swapsLength; ) {
      SellSwap calldata swap = swaps[i];

      // Approve the router if needed
      _approveERC20IfNeeded(swap.params.tokenIn, address(SWAP_ROUTER), swap.params.amountIn);

      // Execute the swap
      try SWAP_ROUTER.exactInputSingle(swap.params) {
        uint256 transfersLength = swap.transfers.length;
        for (uint256 j = 0; j < transfersLength; ) {
          TransferDetail calldata transferDetail = swap.transfers[j];
          if (transferDetail.toETH) {
            // Zero represents "everything"
            uint256 amount = transferDetail.amount == 0
              ? WETH.balanceOf(address(this))
              : transferDetail.amount;

            WETH.withdraw(amount);
            _sendETH(transferDetail.recipient, amount);
          } else {
            // Zero represents "everything"
            uint256 amount = transferDetail.amount == 0
              ? IERC20(swap.params.tokenOut).balanceOf(address(this))
              : transferDetail.amount;

            _sendERC20(transferDetail.recipient, amount, IERC20(swap.params.tokenOut));
          }

          unchecked {
            ++j;
          }
        }
      } catch {
        if (revertIfIncomplete) {
          revert UnsuccessfulFill();
        }
      }

      unchecked {
        ++i;
      }
    }
  }
}
