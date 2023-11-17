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
  topic: "0xb06d2760711c1c15c05bc011b1009a36c0713c6d63567c267678c3a382188b61",
  numTopics: 3,
  abi: new Interface([
    `event MasterNonceInvalidated(
      uint256 indexed nonce,
      address indexed account
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
