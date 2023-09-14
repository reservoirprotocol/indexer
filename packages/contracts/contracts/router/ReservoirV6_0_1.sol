// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";

contract ReservoirV6_0_1 is ReentrancyGuard {
  using Address for address;

  // --- Structs ---

  struct ExecutionInfo {
    address module;
    bytes data;
    uint256 value;
  }

  struct AmountCheckInfo {
    address target;
    bytes data;
    uint256 threshold;
  }

  // --- Errors ---

  error UnsuccessfulExecution();
  error UnsuccessfulPayment();

  // --- Modifiers ---

  modifier refundETH() {
    _;

    uint256 leftover = address(this).balance;
    if (leftover > 0) {
      (bool success, ) = payable(msg.sender).call{value: leftover}("");
      if (!success) {
        revert UnsuccessfulPayment();
      }
    }
  }

  // --- Fallback ---

  receive() external payable {}

  // --- Public ---

  // Trigger a set of executions atomically
  function execute(
    ExecutionInfo[] calldata executionInfos
  ) external payable nonReentrant refundETH {
    uint256 length = executionInfos.length;
    for (uint256 i = 0; i < length; ) {
      _executeInternal(executionInfos[i]);

      unchecked {
        ++i;
      }
    }
  }

  // Trigger a set of executions with amount checking. As opposed to the regular
  // `execute` method, `executeWithAmountCheck` supports stopping the executions
  // once the provided amount check reaches a certain value. This is useful when
  // trying to fill orders with slippage (eg. provide multiple orders and try to
  // fill until a certain balance is reached). In order to be flexible, checking
  // the amount is done generically by calling the `target` contract with `data`.
  // For example, this could be used to check the ERC721 total owned balance (by
  // using `balanceOf(owner)`), the ERC1155 total owned balance per token id (by
  // using `balanceOf(owner, tokenId)`), but also for checking the ERC1155 total
  // owned balance per multiple token ids (by using a custom contract that wraps
  // `balanceOfBatch(owners, tokenIds)`).
  function executeWithAmountCheck(
    ExecutionInfo[] calldata executionInfos,
    AmountCheckInfo calldata amountCheckInfo
  ) external payable nonReentrant refundETH {
    // Cache some data for efficiency
    address target = amountCheckInfo.target;
    bytes calldata data = amountCheckInfo.data;
    uint256 threshold = amountCheckInfo.threshold;

    uint256 length = executionInfos.length;
    for (uint256 i = 0; i < length; ) {
      // Check the amount and break if it exceeds the threshold
      uint256 amount = _getAmount(target, data);
      if (amount >= threshold) {
        break;
      }

      _executeInternal(executionInfos[i]);

      unchecked {
        ++i;
      }
    }
  }

  // --- Internal ---

  function _executeInternal(ExecutionInfo calldata executionInfo) internal {
    address module = executionInfo.module;

    // Ensure the target is a contract
    if (!module.isContract()) {
      revert UnsuccessfulExecution();
    }

    (bool success, ) = module.call{value: executionInfo.value}(executionInfo.data);
    if (!success) {
      revert UnsuccessfulExecution();
    }
  }

  function _getAmount(address target, bytes calldata data) internal view returns (uint256 amount) {
    // Ensure the target is a contract
    if (!target.isContract()) {
      revert UnsuccessfulExecution();
    }

    (bool success, bytes memory result) = target.staticcall(data);
    if (!success) {
      revert UnsuccessfulExecution();
    }

    amount = abi.decode(result, (uint256));
  }
}
