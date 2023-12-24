// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IDittoPool {
  struct SwapTokensForNftsArgs {
    uint256[] nftIds;
    uint256 maxExpectedTokenInput;
    address tokenSender;
    address nftRecipient;
    bytes swapData;
  }

  struct SwapNftsForTokensArgs {
    uint256[] nftIds;
    uint256[] lpIds;
    uint256 minExpectedTokenOutput;
    address nftSender;
    address tokenRecipient;
    bytes permitterData;
    bytes swapData;
  }

  function token() external returns (IERC20);

  function swapNftsForTokens(
    SwapNftsForTokensArgs calldata args_
  ) external returns (uint256 outputAmount);

  function swapTokensForNfts(
    SwapTokensForNftsArgs calldata args_
  ) external returns (uint256 inputAmount);
}
