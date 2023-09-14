// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

interface IEIP2981 {
  function royaltyInfo(
    uint256,
    uint256 price
  ) external view returns (address receiver, uint256 amount);
}

// Basic RoyaltyEngine-compliant wrapper around EIP2981
contract LiteRoyaltyEngine {
  function getRoyaltyView(
    address token,
    uint256 tokenId,
    uint256 price
  ) public view returns (address[] memory recipients, uint256[] memory amounts) {
    recipients = new address[](1);
    amounts = new uint256[](1);

    (address recipient, uint256 amount) = IEIP2981(token).royaltyInfo(tokenId, price);
    recipients[0] = recipient;
    amounts[0] = amount;
  }
}
