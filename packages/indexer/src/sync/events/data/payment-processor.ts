import { Interface } from "@ethersproject/abi";
import { PaymentProcessor } from "@reservoir0x/sdk";

import { config } from "@/config/index";
import { EventData } from "@/events-sync/data";

export const buySingleListing: EventData = {
  kind: "payment-processor",
  subKind: "payment-processor-buy-single-listing",
  addresses: { [PaymentProcessor.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0x7ed668b30822ae5c7db7b4a32f84e6645250bb6db0d1fc73eeb484c5b34b1d1b",
  numTopics: 4,
  abi: new Interface([
    `event BuySingleListing(
        address indexed marketplace,
        address indexed tokenAddress,
        address indexed paymentCoin,
        address buyer,
        address seller,
        uint256 tokenId,
        uint256 amount,
        uint256 salePrice
    )`,
  ]),
};

export const sweepCollectionERC721: EventData = {
  kind: "payment-processor",
  subKind: "payment-processor-sweep-collection-erc721",
  addresses: { [PaymentProcessor.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0x8435e05433e0d3a3fe612b10c36f6623deec79239f76721a154687fef0ca46a1",
  numTopics: 4,
  abi: new Interface([
    `event SweepCollectionERC721(
      address indexed marketplace,
      address indexed tokenAddress,
      address indexed paymentCoin,
      address buyer,
      bool[] unsuccessfulFills,
      address[] sellers,
      uint256[] tokenIds,
      uint256[] salePrices
    )`,
  ]),
};

export const sweepCollectionERC1155: EventData = {
  kind: "payment-processor",
  subKind: "payment-processor-sweep-collection-erc1155",
  addresses: { [PaymentProcessor.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0x35cd37c73a78d0322074e1324a7d5d4cf5c7ff21f3265d03f4d085c532c6f019",
  numTopics: 4,
  abi: new Interface([
    `event SweepCollectionERC1155(
      address indexed marketplace,
      address indexed tokenAddress,
      address indexed paymentCoin,
      address buyer,
      bool[] unsuccessfulFills,
      address[] sellers,
      uint256[] tokenIds,
      uint256[] amounts,
      uint256[] salePrices
    )`,
  ]),
};

export const masterNonceInvalidated: EventData = {
  kind: "payment-processor",
  subKind: "payment-processor-master-nonce-invalidated",
  addresses: { [PaymentProcessor.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0xb06d2760711c1c15c05bc011b1009a36c0713c6d63567c267678c3a382188b61",
  numTopics: 3,
  abi: new Interface([
    `event MasterNonceInvalidated(uint256 indexed nonce, address indexed account)`,
  ]),
};

export const nonceInvalidated: EventData = {
  kind: "payment-processor",
  subKind: "payment-processor-nonce-invalidated",
  addresses: { [PaymentProcessor.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0x61b992b9cb8061087d0e50532a8ba94e22379c7edd39cdb465536ef827dc1be7",
  numTopics: 4,
  abi: new Interface([
    `event NonceInvalidated(
      uint256 indexed nonce, 
      address indexed account, 
      address indexed marketplace, 
      bool wasCancellation
    )`,
  ]),
};
