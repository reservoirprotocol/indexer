// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

interface INFTXVaultFactory {
  function vault(uint256 vaultId) external view returns (address);
}
