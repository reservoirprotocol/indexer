// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {BaseExchangeModule} from "./BaseExchangeModule.sol";
import {BaseModule} from "../BaseModule.sol";
import {IUniversalRouter} from "../../../interfaces/IUniversalRouter.sol";
import {IWETH} from "../../../interfaces/IWETH.sol";
import {IAllowanceTransfer} from "../../../interfaces/IAllowanceTransfer.sol";

// Notes:
// - supports swapping ETH and ERC20 to any token via a direct path

contract UniversalSwapModule is BaseExchangeModule {
  struct TransferDetail {
    address recipient;
    uint256 amount;
    bool toETH;
  }

  struct Swap {
    IUniversalRouter.ExecuteParams params;
    TransferDetail[] transfers;
  }

  // --- Fields ---

  IWETH public immutable WETH;
  IUniversalRouter public immutable UNIVERSAL_ROUTER;
  IAllowanceTransfer public immutable PERMIT2;

  // --- Constructor ---

  constructor(
    address owner,
    address router,
    address weth,
    address swapRouter
  ) BaseModule(owner) BaseExchangeModule(router) {
    WETH = IWETH(weth);
    UNIVERSAL_ROUTER = IUniversalRouter(swapRouter);
    PERMIT2 = IAllowanceTransfer(0x000000000022D473030F116dDEE9F6B43aC78BA3);
  }

  // --- Fallback ---

  receive() external payable {}

  // --- Wrap ---

  function wrap(TransferDetail[] calldata targets) external payable nonReentrant {
    WETH.deposit{value: msg.value}();

    uint256 length = targets.length;
    for (uint256 i = 0; i < length; ) {
      _sendERC20(targets[i].recipient, targets[i].amount, WETH);

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
  ) external payable nonReentrant refundETHLeftover(refundTo) {
   
    // Execute the swap
    UNIVERSAL_ROUTER.execute{value: msg.value}(swap.params.commands, swap.params.inputs, swap.params.deadline);

    uint256 length = swap.transfers.length;
    for (uint256 i = 0; i < length; ) {
      TransferDetail calldata transferDetail = swap.transfers[i];
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
  ) external nonReentrant refundERC20Leftover(refundTo, swap.params.tokenIn) {
    // Approve the router if needed
    _approveERC20IfNeeded(swap.params.tokenIn, address(PERMIT2), swap.params.amountInMaximum);
    PERMIT2.approve(address(swap.params.tokenIn), address(UNIVERSAL_ROUTER), uint160(swap.params.amountInMaximum), uint48(block.timestamp + 100));
    
    // Execute the swap
    UNIVERSAL_ROUTER.execute(swap.params.commands, swap.params.inputs, swap.params.deadline);

    uint256 length = swap.transfers.length;
    for (uint256 i = 0; i < length; ) {
      TransferDetail calldata transferDetail = swap.transfers[i];
      if (transferDetail.toETH) {
        _sendETH(transferDetail.recipient, transferDetail.amount);
      } else {
        bool isETH = address(swap.params.tokenOut) == address(0);
        if (isETH) {
          WETH.deposit{value: transferDetail.amount}();
        }
        _sendERC20(transferDetail.recipient, transferDetail.amount,  isETH ? IERC20(address(WETH)) : IERC20(swap.params.tokenOut));
      }

      unchecked {
        ++i;
      }
    }
  }
}
