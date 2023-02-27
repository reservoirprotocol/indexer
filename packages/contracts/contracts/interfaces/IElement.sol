// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IElement {
  struct Signature {
    uint8 signatureType;
    uint8 v;
    bytes32 r;
    bytes32 s;
  }

  struct Property {
    address propertyValidator;
    bytes propertyData;
  }

  struct Fee {
    address recipient;
    uint256 amount;
    bytes feeData;
  }

  struct NFTSellOrder {
    address maker;
    address taker;
    uint256 expiry;
    uint256 nonce;
    IERC20 erc20Token;
    uint256 erc20TokenAmount;
    Fee[] fees;
    address nft;
    uint256 nftId;
  }

  struct NFTBuyOrder {
    address maker;
    address taker;
    uint256 expiry;
    uint256 nonce;
    IERC20 erc20Token;
    uint256 erc20TokenAmount;
    Fee[] fees;
    address nft;
    uint256 nftId;
    Property[] nftProperties;
  }

  struct ERC1155SellOrder {
    address maker;
    address taker;
    uint256 expiry;
    uint256 nonce;
    IERC20 erc20Token;
    uint256 erc20TokenAmount;
    Fee[] fees;
    address erc1155Token;
    uint256 erc1155TokenId;
    // End of fields shared with NFTOrder
    uint128 erc1155TokenAmount;
  }

  struct ERC1155BuyOrder {
    address maker;
    address taker;
    uint256 expiry;
    uint256 nonce;
    IERC20 erc20Token;
    uint256 erc20TokenAmount;
    Fee[] fees;
    address erc1155Token;
    uint256 erc1155TokenId;
    Property[] erc1155TokenProperties;
    // End of fields shared with NFTOrder
    uint128 erc1155TokenAmount;
  }

  struct BatchSignedOrder {
    address maker;
    uint256 listingTime;
    uint256 expirationTime;
    uint256 startNonce;
    address erc20Token;
    address platformFeeRecipient;
    uint8 v;
    bytes32 r;
    bytes32 s;
    bytes collectionsBytes;
  }

  /// @param data1 [56 bits(startNonce) + 8 bits(v) + 32 bits(listingTime) + 160 bits(maker)]
  /// @param data2 [64 bits(taker part1) + 32 bits(expiryTime) + 160 bits(erc20Token)]
  /// @param data3 [96 bits(taker part2) + 160 bits(platformFeeRecipient)]
  struct Parameter {
    uint256 data1;
    uint256 data2;
    uint256 data3;
    bytes32 r;
    bytes32 s;
  }

  /// @param data1 [56 bits(startNonce) + 8 bits(v) + 32 bits(listingTime) + 160 bits(maker)]
  /// @param data2 [64 bits(taker part1) + 32 bits(expiryTime) + 160 bits(erc20Token)]
  /// @param data3 [96 bits(taker part2) + 160 bits(platformFeeRecipient)]
  struct Parameters {
    uint256 data1;
    uint256 data2;
    uint256 data3;
    bytes32 r;
    bytes32 s;
    bytes collections;
  }

  function buyERC721Ex(
    NFTSellOrder calldata sellOrder,
    Signature calldata signature,
    address taker,
    bytes calldata takerData
  ) external payable;

  function batchBuyERC721sEx(
    NFTSellOrder[] calldata sellOrders,
    Signature[] calldata signatures,
    address[] calldata takers,
    bytes[] calldata takerDatas,
    bool revertIfIncomplete
  ) external payable returns (bool[] memory successes);

  function buyERC1155Ex(
    ERC1155SellOrder calldata sellOrder,
    Signature calldata signature,
    address taker,
    uint128 erc1155BuyAmount,
    bytes calldata takerData
  ) external payable;

  function batchBuyERC1155sEx(
    ERC1155SellOrder[] calldata sellOrders,
    Signature[] calldata signatures,
    address[] calldata takers,
    uint128[] calldata erc1155TokenAmounts,
    bytes[] calldata takerDatas,
    bool revertIfIncomplete
  ) external payable returns (bool[] memory successes);

  function sellERC721(
    NFTBuyOrder calldata buyOrder,
    Signature calldata signature,
    uint256 erc721TokenId,
    bool unwrapNativeToken,
    bytes calldata takerData
  ) external;

  function sellERC1155(
    ERC1155BuyOrder calldata buyOrder,
    Signature calldata signature,
    uint256 erc1155TokenId,
    uint128 erc1155SellAmount,
    bool unwrapNativeToken,
    bytes calldata takerData
  ) external;

  function fillBatchSignedERC721Order(Parameter calldata parameter, bytes calldata collections)
    external
    payable;

  /// @param additional1 [96 bits(withdrawETHAmount) + 160 bits(erc20Token)]
  /// @param additional2 [8 bits(revertIfIncomplete) + 88 bits(unused) + 160 bits(royaltyFeeRecipient)]
  function fillBatchSignedERC721Orders(
    Parameters[] calldata parameters,
    uint256 additional1,
    uint256 additional2
  ) external payable;
}
