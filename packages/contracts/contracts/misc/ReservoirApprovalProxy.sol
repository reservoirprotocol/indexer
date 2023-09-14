// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";

import {IConduit, IConduitController} from "../interfaces/IConduit.sol";
import {IReservoirV6_0_1} from "../interfaces/IReservoirV6_0_1.sol";

// Forked from:
// https://github.com/ProjectOpenSea/seaport/blob/b13939729001cb12f715d7b73422aafeca0bcd0d/contracts/helpers/TransferHelper.sol
contract ReservoirApprovalProxy is ReentrancyGuard {
  // --- Structs ---

  struct TransferHelperItem {
    IConduit.ConduitItemType itemType;
    address token;
    uint256 identifier;
    uint256 amount;
  }

  struct TransferHelperItemsWithRecipient {
    TransferHelperItem[] items;
    address recipient;
  }

  // --- Errors ---

  error ConduitExecutionFailed();
  error InvalidRecipient();

  // --- Fields ---

  IConduitController internal immutable _CONDUIT_CONTROLLER;
  bytes32 internal immutable _CONDUIT_CREATION_CODE_HASH;
  bytes32 internal immutable _CONDUIT_RUNTIME_CODE_HASH;

  IReservoirV6_0_1 internal immutable _ROUTER;

  // --- Constructor ---

  constructor(address conduitController, address router) {
    IConduitController controller = IConduitController(conduitController);
    (_CONDUIT_CREATION_CODE_HASH, _CONDUIT_RUNTIME_CODE_HASH) = controller.getConduitCodeHashes();

    _CONDUIT_CONTROLLER = controller;
    _ROUTER = IReservoirV6_0_1(router);
  }

  // --- Public methods ---

  function bulkTransferWithExecute(
    TransferHelperItemsWithRecipient[] calldata transfers,
    IReservoirV6_0_1.ExecutionInfo[] calldata executionInfos,
    bytes32 conduitKey
  ) external nonReentrant {
    uint256 numTransfers = transfers.length;

    address conduit = address(
      uint160(
        uint256(
          keccak256(
            abi.encodePacked(
              bytes1(0xff),
              address(_CONDUIT_CONTROLLER),
              conduitKey,
              _CONDUIT_CREATION_CODE_HASH
            )
          )
        )
      )
    );

    uint256 sumOfItemsAcrossAllTransfers;
    unchecked {
      for (uint256 i = 0; i < numTransfers; ++i) {
        TransferHelperItemsWithRecipient calldata transfer = transfers[i];
        sumOfItemsAcrossAllTransfers += transfer.items.length;
      }
    }

    IConduit.ConduitTransfer[] memory conduitTransfers = new IConduit.ConduitTransfer[](
      sumOfItemsAcrossAllTransfers
    );

    uint256 itemIndex;
    unchecked {
      for (uint256 i = 0; i < numTransfers; ++i) {
        TransferHelperItemsWithRecipient calldata transfer = transfers[i];
        TransferHelperItem[] calldata transferItems = transfer.items;

        _checkRecipientIsNotZeroAddress(transfer.recipient);

        uint256 numItemsInTransfer = transferItems.length;
        for (uint256 j = 0; j < numItemsInTransfer; ++j) {
          TransferHelperItem calldata item = transferItems[j];
          conduitTransfers[itemIndex] = IConduit.ConduitTransfer(
            item.itemType,
            item.token,
            msg.sender,
            transfer.recipient,
            item.identifier,
            item.amount
          );

          ++itemIndex;
        }
      }
    }

    bytes4 conduitMagicValue = IConduit(conduit).execute(conduitTransfers);
    if (conduitMagicValue != IConduit.execute.selector) {
      revert ConduitExecutionFailed();
    }

    _ROUTER.execute(executionInfos);
  }

  function _checkRecipientIsNotZeroAddress(address recipient) internal pure {
    if (recipient == address(0x0)) {
      revert InvalidRecipient();
    }
  }
}
