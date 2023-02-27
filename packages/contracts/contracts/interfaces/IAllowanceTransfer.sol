// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

interface IAllowanceTransfer {
  struct PermitDetails {
    address token;
    uint160 amount;
    uint48 expiration;
    uint48 nonce;
  }

  struct PermitBatch {
    PermitDetails[] details;
    address spender;
    uint256 sigDeadline;
  }

  struct AllowanceTransferDetails {
    address from;
    address to;
    uint160 amount;
    address token;
  }

  function permit(
    address owner,
    PermitBatch memory permitBatch,
    bytes calldata signature
  ) external;

  function transferFrom(AllowanceTransferDetails[] calldata transferDetails) external;
}
