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

export const createdOrUpdatedSecurityPolicy: EventData = {
  kind: "payment-processor",
  subKind: "payment-processor-created-or-updated-security-policy",
  addresses: { [PaymentProcessor.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0xfa0f19ecb97e973eefa78c4ef4f6be467d4e0d320b88fa6b3e785f09df7089f6",
  numTopics: 2,
  abi: new Interface([
    `event CreatedOrUpdatedSecurityPolicy(
      uint256 indexed securityPolicyId, 
      bool enforceExchangeWhitelist,
      bool enforcePaymentMethodWhitelist,
      bool enforcePricingConstraints,
      bool disablePrivateListings,
      bool disableDelegatedPurchases,
      bool disableEIP1271Signatures,
      bool disableExchangeWhitelistEOABypass,
      uint32 pushPaymentGasLimit,
      string policyName
    )`,
  ]),
};

export const updatedCollectionPaymentCoin: EventData = {
  kind: "payment-processor",
  subKind: "payment-processor-updated-collection-payment-coin",
  addresses: { [PaymentProcessor.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0x53ab061e9517daf6849d4bde07950e3d199f73115c2e4842a8b20a62e83abd1c",
  numTopics: 3,
  abi: new Interface([
    `event UpdatedCollectionPaymentCoin(address indexed tokenAddress, address indexed paymentCoin)`,
  ]),
};

export const updatedCollectionSecurityPolicy: EventData = {
  kind: "payment-processor",
  subKind: "payment-processor-updated-collection-security-policy",
  addresses: { [PaymentProcessor.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0x8a2e423ccab4754dc61747d26d19bc14c55577d5fcc54b4a67d9b82a016b61df",
  numTopics: 3,
  abi: new Interface([
    `event UpdatedCollectionSecurityPolicy(address indexed tokenAddress, uint256 indexed securityPolicyId)`,
  ]),
};
