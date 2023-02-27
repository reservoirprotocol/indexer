// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

interface IZora {
  function fillAsk(
    address tokenContract,
    uint256 tokenId,
    address fillCurrency,
    uint256 fillAmount,
    address finder
  ) external payable;
}
