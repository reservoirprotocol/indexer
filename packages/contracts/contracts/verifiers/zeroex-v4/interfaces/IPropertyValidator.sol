// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

interface IPropertyValidator {
  function validateProperty(
    address tokenAddress,
    uint256 tokenId,
    bytes calldata propertyData
  ) external view;
}
