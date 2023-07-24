// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {ERC2771Context} from "./ERC2771Context.sol";

import {IERC20Permit} from "../interfaces/IERC20Permit.sol";
import {IReservoirV6_0_1} from "../interfaces/IReservoirV6_0_1.sol";

// Notes:
// - transfer ERC20 tokens via gasless permit (eg. USDC)
// - ERC2771-compliant for meta-transaction support

contract PermitProxy is ERC2771Context, ReentrancyGuard {
  using SafeERC20 for IERC20;

  // --- Structs ---

  struct Transfer {
    address recipient;
    uint256 amount;
  }

  struct PermitWithTransfers {
    IERC20 token;
    address owner;
    uint256 amount;
    uint256 deadline;
    uint8 v;
    bytes32 r;
    bytes32 s;
    Transfer[] transfers;
  }

  // --- Errors ---

  error Unauthorized();

  // --- Fields ---

  IReservoirV6_0_1 internal immutable ROUTER;

  // --- Constructor ---

  constructor(address router, address trustedForwarder) ERC2771Context(trustedForwarder) {
    ROUTER = IReservoirV6_0_1(router);
  }

  // --- Public methods ---

  function transferWithExecute(
    PermitWithTransfers[] calldata permits,
    IReservoirV6_0_1.ExecutionInfo[] calldata executionInfos
  ) external nonReentrant {
    uint256 permitsLength = permits.length;
    for (uint256 i = 0; i < permitsLength; ) {
      PermitWithTransfers memory permit = permits[i];
      if (permit.owner != _msgSender()) {
        revert Unauthorized();
      }

      IERC20Permit(address(permit.token)).permit(
        permit.owner,
        address(this),
        permit.amount,
        permit.deadline,
        permit.v,
        permit.r,
        permit.s
      );

      uint256 transfersLength = permit.transfers.length;
      for (uint256 j = 0; j < transfersLength; ) {
        permit.token.safeTransferFrom(
          permit.owner,
          permit.transfers[j].recipient,
          permit.transfers[j].amount
        );

        unchecked {
          ++j;
        }
      }

      unchecked {
        ++i;
      }
    }

    ROUTER.execute(executionInfos);
  }
}
