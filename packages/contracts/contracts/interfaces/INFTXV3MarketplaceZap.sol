// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {INFTXVaultFactory} from "./INFTXVaultFactory.sol";

interface INFTXV3MarketplaceZap {
  function nftxVaultFactory() external view returns (INFTXVaultFactory);

  struct SellOrder {
    uint256 vaultId;
    address collection;
    IERC20 currency;
    uint256[] idsIn;
    // For ERC1155 only
    uint256[] amounts;
    uint256 price;
    bytes executeCallData;
    bool deductRoyalty;
  }

  struct BuyOrder {
    uint256 vaultId;
    address collection;
    uint256[] idsOut;
    uint256 price;
    bytes executeCallData;
    uint256 vTokenPremiumLimit;
    bool deductRoyalty;
  }

  function sell721(
    uint256 vaultId,
    uint256[] calldata idsIn,
    bytes calldata executeCallData,
    address payable to,
    bool deductRoyalty
  ) external;

  function sell1155(
    uint256 vaultId,
    uint256[] calldata idsIn,
    uint256[] calldata amounts,
    bytes calldata executeCallData,
    address payable to,
    bool deductRoyalty
  ) external;

  function buyNFTsWithETH(
    uint256 vaultId,
    uint256[] calldata idsOut,
    bytes calldata executeCallData,
    address payable to,
    uint256 vTokenPremiumLimit,
    bool deductRoyalty
  ) external payable;
}
