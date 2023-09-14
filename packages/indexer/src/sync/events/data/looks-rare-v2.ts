import { Interface } from "@ethersproject/abi";
import { LooksRareV2 } from "@reservoir0x/sdk";

import { config } from "@/config/index";
import { EventData } from "@/events-sync/data";

export const newBidAskNonces: EventData = {
  kind: "looks-rare-v2",
  subKind: "looks-rare-v2-new-bid-ask-nonces",
  addresses: { [LooksRareV2.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0xb738dd6073fae1a7128e3fcc6b4ca6e1356b7232f87cc98f8a2857bcd83dfc44",
  numTopics: 1,
  abi: new Interface([
    `event NewBidAskNonces(
      address user,
      uint256 bidNonce,
      uint256 askNonce
    )`,
  ]),
};

export const orderNoncesCancelled: EventData = {
  kind: "looks-rare-v2",
  subKind: "looks-rare-v2-order-nonces-cancelled",
  addresses: { [LooksRareV2.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0x0560c6093fba8a508d0e6ea3b4d7260d7afa9b152731f03a2d05dfe39b0ec425",
  numTopics: 1,
  abi: new Interface([
    `event OrderNoncesCancelled(
      address user, 
      uint256[] orderNonces
    )`,
  ]),
};

export const subsetNoncesCancelled: EventData = {
  kind: "looks-rare-v2",
  subKind: "looks-rare-v2-subset-nonces-cancelled",
  addresses: { [LooksRareV2.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0xe8036d6fb143373f3ff63e551373f5fffe4267f6809bf6d3934014a18a9b38f6",
  numTopics: 1,
  abi: new Interface([
    `event SubsetNoncesCancelled(
      address user, 
      uint256[] subsetNonces
    )`,
  ]),
};

export const takerAsk: EventData = {
  kind: "looks-rare-v2",
  subKind: "looks-rare-v2-taker-ask",
  addresses: { [LooksRareV2.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0x9aaa45d6db2ef74ead0751ea9113263d1dec1b50cea05f0ca2002cb8063564a4",
  numTopics: 1,
  abi: new Interface([
    {
      anonymous: false,
      inputs: [
        {
          components: [
            {
              internalType: "bytes32",
              name: "orderHash",
              type: "bytes32",
            },
            {
              internalType: "uint256",
              name: "orderNonce",
              type: "uint256",
            },
            {
              internalType: "bool",
              name: "isNonceInvalidated",
              type: "bool",
            },
          ],
          indexed: false,
          internalType: "struct ILooksRareProtocol.NonceInvalidationParameters",
          name: "nonceInvalidationParameters",
          type: "tuple",
        },
        {
          indexed: false,
          internalType: "address",
          name: "askUser",
          type: "address",
        },
        {
          indexed: false,
          internalType: "address",
          name: "bidUser",
          type: "address",
        },
        {
          indexed: false,
          internalType: "uint256",
          name: "strategyId",
          type: "uint256",
        },
        {
          indexed: false,
          internalType: "address",
          name: "currency",
          type: "address",
        },
        {
          indexed: false,
          internalType: "address",
          name: "collection",
          type: "address",
        },
        {
          indexed: false,
          internalType: "uint256[]",
          name: "itemIds",
          type: "uint256[]",
        },
        {
          indexed: false,
          internalType: "uint256[]",
          name: "amounts",
          type: "uint256[]",
        },
        {
          indexed: false,
          internalType: "address[2]",
          name: "feeRecipients",
          type: "address[2]",
        },
        {
          indexed: false,
          internalType: "uint256[3]",
          name: "feeAmounts",
          type: "uint256[3]",
        },
      ],
      name: "TakerAsk",
      type: "event",
    },
    // `event TakerAsk(
    //   (
    //     bytes32 orderHash,
    //     uint256 orderNonce,
    //     bool isNonceInvalidated,
    //   ) nonceInvalidationParameters,
    //   address askUser,
    //   address bidUser,
    //   uint256 strategyId,
    //   address currency,
    //   address collection,
    //   uint256[] itemIds,
    //   uint256[] amounts,
    //   address[2] feeRecipients,
    //   uint256[3] feeAmounts,
    // )`,
  ]),
};

export const takerBid: EventData = {
  kind: "looks-rare-v2",
  subKind: "looks-rare-v2-taker-bid",
  addresses: { [LooksRareV2.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0x3ee3de4684413690dee6fff1a0a4f92916a1b97d1c5a83cdf24671844306b2e3",
  numTopics: 1,
  abi: new Interface([
    {
      anonymous: false,
      inputs: [
        {
          components: [
            {
              internalType: "bytes32",
              name: "orderHash",
              type: "bytes32",
            },
            {
              internalType: "uint256",
              name: "orderNonce",
              type: "uint256",
            },
            {
              internalType: "bool",
              name: "isNonceInvalidated",
              type: "bool",
            },
          ],
          indexed: false,
          internalType: "struct ILooksRareProtocol.NonceInvalidationParameters",
          name: "nonceInvalidationParameters",
          type: "tuple",
        },
        {
          indexed: false,
          internalType: "address",
          name: "bidUser",
          type: "address",
        },
        {
          indexed: false,
          internalType: "address",
          name: "bidRecipient",
          type: "address",
        },
        {
          indexed: false,
          internalType: "uint256",
          name: "strategyId",
          type: "uint256",
        },
        {
          indexed: false,
          internalType: "address",
          name: "currency",
          type: "address",
        },
        {
          indexed: false,
          internalType: "address",
          name: "collection",
          type: "address",
        },
        {
          indexed: false,
          internalType: "uint256[]",
          name: "itemIds",
          type: "uint256[]",
        },
        {
          indexed: false,
          internalType: "uint256[]",
          name: "amounts",
          type: "uint256[]",
        },
        {
          indexed: false,
          internalType: "address[2]",
          name: "feeRecipients",
          type: "address[2]",
        },
        {
          indexed: false,
          internalType: "uint256[3]",
          name: "feeAmounts",
          type: "uint256[3]",
        },
      ],
      name: "TakerBid",
      type: "event",
    },
    // `event TakerBid(
    //   (
    //     bytes32 orderHash,
    //     uint256 orderNonce,
    //     bool isNonceInvalidated,
    //   ) nonceInvalidationParameters,
    //   address bidUser,
    //   address bidRecipient,
    //   uint256 strategyId,
    //   address currency,
    //   address collection,
    //   uint256[] itemIds,
    //   uint256[] amounts,
    //   address[2] feeRecipients,
    //   uint256[3] feeAmounts
    // )`,
  ]),
};
