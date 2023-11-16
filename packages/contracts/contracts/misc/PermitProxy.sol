// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {ERC2771Context} from "./ERC2771Context.sol";

import {IEIP2612} from "../interfaces/IEIP2612.sol";
import {IReservoirV6_0_1} from "../interfaces/IReservoirV6_0_1.sol";

// Notes:
// - transfer ERC20 tokens via gasless EIP2612 permits
// - ERC2771-compliant for meta-transaction support

contract PermitProxy is ERC2771Context, ReentrancyGuard {
  using SafeERC20 for IERC20;

  // --- Structs ---

  struct Transfer {
    address recipient;
    uint256 amount;
  }

  // https://eips.ethereum.org/EIPS/eip-2612
  struct EIP2612Permit {
    IERC20 token;
    address owner;
    address spender;
    uint256 amount;
    uint256 deadline;
    uint8 v;
    bytes32 r;
    bytes32 s;
  }

  struct EIP2612PermitWithTransfers {
    EIP2612Permit permit;
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

  function eip2612PermitWithTransfersAndExecute(
    EIP2612PermitWithTransfers[] calldata permitsWithTransfers,
    IReservoirV6_0_1.ExecutionInfo[] calldata executionInfos
  ) external nonReentrant {
    uint256 permitsWithTransfersLength = permitsWithTransfers.length;
    for (uint256 i = 0; i < permitsWithTransfersLength; ) {
      EIP2612PermitWithTransfers memory permitWithTransfers = permitsWithTransfers[i];
      EIP2612Permit memory permit = permitWithTransfers.permit;
      Transfer[] memory transfers = permitWithTransfers.transfers;

      if (permit.owner != _msgSender()) {
        revert Unauthorized();
      }

      IEIP2612(address(permit.token)).permit(
        permit.owner,
        permit.spender,
        permit.amount,
        permit.deadline,
        permit.v,
        permit.r,
        permit.s
      );

      uint256 transfersLength = transfers.length;
      for (uint256 j = 0; j < transfersLength; ) {
        permit.token.safeTransferFrom(permit.owner, transfers[j].recipient, transfers[j].amount);

        unchecked {
          ++j;
        }
      }

      unchecked {
        ++i;
      }
    }

    if (executionInfos.length > 0) {
      ROUTER.execute(executionInfos);
    }
  }

  function eip2612Permit(EIP2612Permit[] calldata permits) external nonReentrant {
    uint256 permitsLength = permits.length;
    for (uint256 i = 0; i < permitsLength; ) {
      EIP2612Permit memory permit = permits[i];

      IEIP2612(address(permit.token)).permit(
        permit.owner,
        permit.spender,
        permit.amount,
        permit.deadline,
        permit.v,
        permit.r,
        permit.s
      );

      unchecked {
        ++i;
      }
    }
  }
}
