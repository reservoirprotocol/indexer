// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

interface IPaymentProcessorV2 {
    
    struct SignatureECDSA {
        uint8 v;
        bytes32 r;
        bytes32 s;
    }

    struct Cosignature {
        address signer;
        address taker;
        uint256 expiration;
        uint8 v;
        bytes32 r;
        bytes32 s;
    }

    struct FeeOnTop {
        address recipient;
        uint256 amount;
    }

    struct TokenSetProof {
        bytes32 rootHash;
        bytes32[] proof;
    }

    enum Sides { 
        Buy, 
        Sell 
    }

    enum OrderProtocols { 
        ERC721_FILL_OR_KILL,
        ERC1155_FILL_OR_KILL,
        ERC1155_FILL_PARTIAL
    }

    struct Order {
        OrderProtocols protocol;
        address maker;
        address beneficiary;
        address marketplace;
        address fallbackRoyaltyRecipient;
        address paymentMethod;
        address tokenAddress;
        uint256 tokenId;
        uint248 amount;
        uint256 itemPrice;
        uint256 nonce;
        uint256 expiration;
        uint256 marketplaceFeeNumerator;
        uint256 maxRoyaltyFeeNumerator;
        uint248 requestedFillAmount;
        uint248 minimumFillAmount;
    }

    struct BuyListingInput {
        bytes32 domainSeparator;
        Order saleDetails;
        SignatureECDSA signature;
        Cosignature cosignature;
        FeeOnTop feeOnTop;
    }

    struct AcceptOfferInput {
        bytes32 domainSeparator;
        bool isCollectionLevelOffer; 
        Order saleDetails;
        SignatureECDSA signature;
        TokenSetProof tokenSetProof;
        Cosignature cosignature;
        FeeOnTop feeOnTop;
    }

    function buyListing(bytes calldata data) external payable;
    function acceptOffer(bytes calldata data) external payable;
}
