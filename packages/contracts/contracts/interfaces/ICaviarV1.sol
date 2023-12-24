// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

interface ICaviarPoolV1 {
  struct Message {
    bytes32 id;
    bytes payload;
    uint256 timestamp;
    bytes signature;
  }

  function nft() external returns (address);

  function baseToken() external returns (address);

  function buyQuote(uint256 outputAmount) external view returns (uint256);

  function nftBuy(
    uint256[] calldata tokenIds,
    uint256 maxInputAmount,
    uint256 deadline
  ) external payable returns (uint256 inputAmount);

  function nftSell(
    uint256[] calldata tokenIds,
    uint256 minOutputAmount,
    uint256 deadline,
    bytes32[][] calldata proofs,
    Message[] calldata messages
  ) external returns (uint256 outputAmount);
}
