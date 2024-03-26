import { Interface } from "@ethersproject/abi";
import { PaymentProcessorV2 } from "@reservoir0x/sdk";

import { config } from "@/config/index";
import { EventData } from "@/events-sync/data";

export const buyListingERC721: EventData = {
  kind: "payment-processor-v2",
  subKind: "payment-processor-v2-buy-listing-erc721",
  addresses: { [PaymentProcessorV2.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0xffb29e9cf48456d56b6d414855b66a7ec060ce2054dcb124a1876310e1b7355c",
  numTopics: 4,
  abi: new Interface([
    `event BuyListingERC721(
      address indexed buyer,
      address indexed seller,
      address indexed tokenAddress,
      address beneficiary,
      address paymentCoin,
      uint256 tokenId,
      uint256 salePrice
    )`,
  ]),
};

export const buyListingERC1155: EventData = {
  kind: "payment-processor-v2",
  subKind: "payment-processor-v2-buy-listing-erc1155",
  addresses: { [PaymentProcessorV2.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0x1217006325a98bdcc6afc9c44965bb66ac7460a44dc57c2ac47622561d25c45a",
  numTopics: 4,
  abi: new Interface([
    `event BuyListingERC1155(
      address indexed buyer,
      address indexed seller,
      address indexed tokenAddress,
      address beneficiary,
      address paymentCoin,
      uint256 tokenId,
      uint256 amount,
      uint256 salePrice
    )`,
  ]),
};

export const acceptOfferERC721: EventData = {
  kind: "payment-processor-v2",
  subKind: "payment-processor-v2-accept-offer-erc721",
  addresses: { [PaymentProcessorV2.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0x8b87c0b049fe52718fe6ff466b514c5a93c405fb0de8fbd761a23483f9f9e198",
  numTopics: 4,
  abi: new Interface([
    `event AcceptOfferERC721(
      address indexed seller,
      address indexed buyer,
      address indexed tokenAddress,
      address beneficiary,
      address paymentCoin,
      uint256 tokenId,
      uint256 salePrice
    )`,
  ]),
};

export const acceptOfferERC1155: EventData = {
  kind: "payment-processor-v2",
  subKind: "payment-processor-v2-accept-offer-erc1155",
  addresses: { [PaymentProcessorV2.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0x6f4c56c4b9a9d2479f963d802b19d17b02293ce1225461ac0cb846c482ee3c3e",
  numTopics: 4,
  abi: new Interface([
    `event AcceptOfferERC1155(
      address indexed seller,
      address indexed buyer,
      address indexed tokenAddress,
      address beneficiary,
      address paymentCoin,
      uint256 tokenId,
      uint256 amount,
      uint256 salePrice
    )`,
  ]),
};

export const masterNonceInvalidated: EventData = {
  kind: "payment-processor-v2",
  subKind: "payment-processor-v2-master-nonce-invalidated",
  addresses: { [PaymentProcessorV2.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0x9614574d6542397172c19ba2bf4588434feeb977576e92b7b59b38242ab59609",
  numTopics: 2,
  abi: new Interface([
    `event MasterNonceInvalidated(
      address indexed account,
      uint256 nonce
    )`,
  ]),
};

export const nonceInvalidated: EventData = {
  kind: "payment-processor-v2",
  subKind: "payment-processor-v2-nonce-invalidated",
  addresses: { [PaymentProcessorV2.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0xf3003920635c7d35c4f314eaeeed4b4c653ccb36608a86d57df761d460eab09d",
  numTopics: 3,
  abi: new Interface([
    `event NonceInvalidated(
      uint256 indexed nonce,
      address indexed account,
      bool wasCancellation
    )`,
  ]),
};

export const orderDigestInvalidated: EventData = {
  kind: "payment-processor-v2",
  subKind: "payment-processor-v2-order-digest-invalidated",
  addresses: { [PaymentProcessorV2.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0xc63c82396a1b7865295ff481988a98493c2c3cc29066c229b8001c6f5dd647a9",
  numTopics: 3,
  abi: new Interface([
    `event OrderDigestInvalidated(
      bytes32 indexed orderDigest,
      address indexed account,
      bool wasCancellation
    )`,
  ]),
};

export const paymentMethodAddedToWhitelist: EventData = {
  kind: "payment-processor-v2",
  subKind: "payment-processor-v2-payment-method-added-to-whitelist",
  addresses: { [PaymentProcessorV2.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0xab066026be9f5f930c1018a7e9eeddf7921b9026531b1b9935a66eb62d163fe8",
  numTopics: 3,
  abi: new Interface([
    `event PaymentMethodAddedToWhitelist(
      uint32 indexed paymentMethodWhitelistId,
      address indexed paymentMethod
    )`,
  ]),
};

export const paymentMethodRemovedFromWhitelist: EventData = {
  kind: "payment-processor-v2",
  subKind: "payment-processor-v2-payment-method-removed-from-whitelist",
  addresses: { [PaymentProcessorV2.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0xf156bd3efe5d358c94cc34b12810b94f524f03ef4e7f71158e22b6775ef75ba3",
  numTopics: 3,
  abi: new Interface([
    `event PaymentMethodRemovedFromWhitelist(
      uint32 indexed paymentMethodWhitelistId,
      address indexed paymentMethod
    )`,
  ]),
};

export const updatedCollectionLevelPricingBoundaries: EventData = {
  kind: "payment-processor-v2",
  subKind: "payment-processor-v2-updated-collection-level-pricing-boundaries",
  addresses: { [PaymentProcessorV2.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0xdd61e240b8302b21ad48e3bec0f6e9538c9e4cfffdfde6d604963069d7e23c34",
  numTopics: 2,
  abi: new Interface([
    `event UpdatedCollectionLevelPricingBoundaries(
      address indexed tokenAddress,
      uint256 floorPrice,
      uint256 ceilingPrice
    )`,
  ]),
};

export const updatedCollectionPaymentSettings: EventData = {
  kind: "payment-processor-v2",
  subKind: "payment-processor-v2-updated-collection-payment-settings",
  addresses: { [PaymentProcessorV2.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0xe6a4f8022c953d2d77979a9c33363936fafc1dcadec52ae9af45b6d3f17973d3",
  numTopics: 4,
  abi: new Interface([
    `event UpdatedCollectionPaymentSettings(
      address indexed tokenAddress,
      uint8 paymentSettings,
      uint32 indexed paymentMethodWhitelistId,
      address indexed constrainedPricingPaymentMethod,
      uint16 royaltyBackfillNumerator,
      address royaltyBackfillReceiver,
      uint16 royaltyBountyNumerator,
      address exclusiveBountyReceiver,
      bool blockTradesFromUntrustedChannels,
      bool blockBannedAccounts
    )`,
  ]),
};

export const updatedTokenLevelPricingBoundaries: EventData = {
  kind: "payment-processor-v2",
  subKind: "payment-processor-v2-updated-token-level-pricing-boundaries",
  addresses: { [PaymentProcessorV2.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0x38d88037c7f872f6e5d89332cdae804370cd604776bfcabf8da1f2e11945e271",
  numTopics: 3,
  abi: new Interface([
    `event UpdatedTokenLevelPricingBoundaries(
      address indexed tokenAddress,
      uint256 indexed tokenId,
      uint256 floorPrice,
      uint256 ceilingPrice
    )`,
  ]),
};

export const trustedChannelRemovedForCollection: EventData = {
  kind: "payment-processor-v2",
  subKind: "payment-processor-v2-trusted-channel-removed-for-collection",
  addresses: { [PaymentProcessorV2.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0x0a96ed211f335f5d4fe7b4fa19c97f07198b6582d6ae3ef987740c0798de3c18",
  numTopics: 3,
  abi: new Interface([
    `event TrustedChannelRemovedForCollection(
      address indexed tokenAddress,
      uint256 indexed channel
    )`,
  ]),
};

export const trustedChannelAddedForCollection: EventData = {
  kind: "payment-processor-v2",
  subKind: "payment-processor-v2-trusted-channel-added-for-collection",
  addresses: { [PaymentProcessorV2.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0x5ad5afe7f91207e8a3eba0274c5fb0599a0cc2b72709ec47fa5e157ae8375ba5",
  numTopics: 3,
  abi: new Interface([
    `event TrustedChannelAddedForCollection(
      address indexed tokenAddress, 
      address indexed channel
    )`,
  ]),
};

export const bannedAccountAddedForCollection: EventData = {
  kind: "payment-processor-v2",
  subKind: "payment-processor-v2-banned-account-added-for-collection",
  addresses: { [PaymentProcessorV2.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0xf46e1c40f2a6333765b4c7487d9c4bf60e83908611b41b15903e6a506e4ee63b",
  numTopics: 3,
  abi: new Interface([
    `event BannedAccountAddedForCollection(
      address indexed tokenAddress, 
      address indexed account
    )`,
  ]),
};

export const bannedAccountRemovedForCollection: EventData = {
  kind: "payment-processor-v2",
  subKind: "payment-processor-v2-banned-account-removed-for-collection",
  addresses: { [PaymentProcessorV2.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0xc9f167828587c3dee35aac91efcb05ed56a669e13fded989727888b812c24389",
  numTopics: 3,
  abi: new Interface([
    `event BannedAccountRemovedForCollection(
      address indexed tokenAddress, 
      address indexed account
    )`,
  ]),
};
