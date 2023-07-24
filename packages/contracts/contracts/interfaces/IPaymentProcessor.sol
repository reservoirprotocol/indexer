// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

interface IPaymentProcessor {
  enum TokenProtocols {
    ERC721,
    ERC1155
  }

  struct SignatureECDSA {
    uint8 v;
    bytes32 r;
    bytes32 s;
  }

  struct MatchedOrder {
    bool sellerAcceptedOffer;
    bool collectionLevelOffer;
    TokenProtocols protocol;
    address paymentCoin;
    address tokenAddress;
    address seller;
    address privateBuyer;
    address buyer;
    address delegatedPurchaser;
    address marketplace;
    uint256 marketplaceFeeNumerator;
    uint256 maxRoyaltyFeeNumerator;
    uint256 listingNonce;
    uint256 offerNonce;
    uint256 listingMinPrice;
    uint256 offerPrice;
    uint256 listingExpiration;
    uint256 offerExpiration;
    uint256 tokenId;
    uint256 amount;
  }

  function buySingleListing(
    MatchedOrder memory saleDetails,
    SignatureECDSA memory signedListing,
    SignatureECDSA memory signedOffer
  ) external payable;
}
