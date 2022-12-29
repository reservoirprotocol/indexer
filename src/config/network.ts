/* eslint-disable no-fallthrough */

// Any new network that is supported should have a corresponding
// entry in the configuration methods below

import { AddressZero } from "@ethersproject/constants";
import * as Sdk from "@reservoir0x/sdk";

import { idb } from "@/common/db";
import { config } from "@/config/index";
import { Currency } from "@/utils/currencies";

export const getNetworkName = () => {
  switch (config.chainId) {
    case 1:
      return "mainnet";
    case 5:
      return "goerli";
    case 10:
      return "optimism";
    case 137:
      return "polygon";
    default:
      return "unknown";
  }
};

export const getServiceName = () => {
  const isRailway = config.railwayStaticUrl !== "";
  return `indexer-${isRailway ? "" : "fc-"}${config.version}-${getNetworkName()}`;
};

type NetworkSettings = {
  enableWebSocket: boolean;
  enableReorgCheck: boolean;
  reorgCheckFrequency: number[];
  realtimeSyncFrequencySeconds: number;
  realtimeSyncMaxBlockLag: number;
  backfillBlockBatchSize: number;
  metadataMintDelay: number;
  enableMetadataAutoRefresh: boolean;
  washTradingExcludedContracts: string[];
  washTradingWhitelistedAddresses: string[];
  washTradingBlacklistedAddresses: string[];
  mintsAsSalesBlacklist: string[];
  mintAddresses: string[];
  multiCollectionContracts: string[];
  whitelistedCurrencies: Map<string, Currency>;
  supportedBidCurrencies: { [currency: string]: boolean };
  coingecko?: {
    networkId: string;
  };
  onStartup?: () => Promise<void>;
};

export const getNetworkSettings = (): NetworkSettings => {
  const defaultNetworkSettings: NetworkSettings = {
    enableWebSocket: true,
    enableReorgCheck: true,
    realtimeSyncFrequencySeconds: 15,
    realtimeSyncMaxBlockLag: 16,
    backfillBlockBatchSize: 16,
    metadataMintDelay: 120,
    enableMetadataAutoRefresh: false,
    washTradingExcludedContracts: [],
    washTradingWhitelistedAddresses: [],
    washTradingBlacklistedAddresses: [],
    multiCollectionContracts: [],
    mintsAsSalesBlacklist: [],
    mintAddresses: [AddressZero],
    reorgCheckFrequency: [1, 5, 10, 30, 60], // In minutes
    whitelistedCurrencies: new Map<string, Currency>(),
    supportedBidCurrencies: { [Sdk.Common.Addresses.Weth[config.chainId]?.toLowerCase()]: true },
  };

  switch (config.chainId) {
    // Ethereum
    case 1:
      return {
        ...defaultNetworkSettings,
        metadataMintDelay: 900,
        enableMetadataAutoRefresh: true,
        washTradingExcludedContracts: [
          // ArtBlocks Contracts
          "0x059edd72cd353df5106d2b9cc5ab83a52287ac3a",
          "0xa7d8d9ef8d8ce8992df33d8b8cf4aebabd5bd270",
          "0x99a9b7c1116f9ceeb1652de04d5969cce509b069",
          // ArtBlocks Engine Contracts
          "0xbdde08bd57e5c9fd563ee7ac61618cb2ecdc0ce0",
          "0x28f2d3805652fb5d359486dffb7d08320d403240",
          "0x64780ce53f6e966e18a22af13a2f97369580ec11",
          "0x010be6545e14f1dc50256286d9920e833f809c6a",
          "0x13aae6f9599880edbb7d144bb13f1212cee99533",
          "0xa319c382a702682129fcbf55d514e61a16f97f9c",
          "0xd10e3dee203579fcee90ed7d0bdd8086f7e53beb",
          "0x62e37f664b5945629b6549a87f8e10ed0b6d923b",
          "0x0a1bbd57033f57e7b6743621b79fcb9eb2ce3676",
          "0x942bc2d3e7a589fe5bd4a5c6ef9727dfd82f5c8a",
        ],
        washTradingBlacklistedAddresses: ["0xac335e6855df862410f96f345f93af4f96351a87"],
        multiCollectionContracts: [
          // ArtBlocks Contracts
          "0x059edd72cd353df5106d2b9cc5ab83a52287ac3a",
          "0xa7d8d9ef8d8ce8992df33d8b8cf4aebabd5bd270",
          "0x99a9b7c1116f9ceeb1652de04d5969cce509b069",
          // ArtBlocks Engine Contracts
          "0xbdde08bd57e5c9fd563ee7ac61618cb2ecdc0ce0",
          "0x28f2d3805652fb5d359486dffb7d08320d403240",
          "0x64780ce53f6e966e18a22af13a2f97369580ec11",
          "0x010be6545e14f1dc50256286d9920e833f809c6a",
          "0x13aae6f9599880edbb7d144bb13f1212cee99533",
          "0xa319c382a702682129fcbf55d514e61a16f97f9c",
          "0xd10e3dee203579fcee90ed7d0bdd8086f7e53beb",
          "0x62e37f664b5945629b6549a87f8e10ed0b6d923b",
          "0x0a1bbd57033f57e7b6743621b79fcb9eb2ce3676",
          "0x942bc2d3e7a589fe5bd4a5c6ef9727dfd82f5c8a",
        ],
        mintsAsSalesBlacklist: [
          // Uniswap V3: Positions NFT
          "0xc36442b4a4522e871399cd717abdd847ab11fe88",
        ],
        mintAddresses: [
          ...defaultNetworkSettings.mintAddresses,
          // Nifty Gateway Omnibus
          "0xe052113bd7d7700d623414a0a4585bcae754e9d5",
        ],
        whitelistedCurrencies: new Map([
          [
            "0xceb726e6383468dd8ac0b513c8330cc9fb4024a8",
            {
              contract: "0xceb726e6383468dd8ac0b513c8330cc9fb4024a8",
              name: "Worms",
              symbol: "WORMS",
              decimals: 18,
            },
          ],
          [
            "0xefe804a604fd3175220d5a4f2fc1a048c479c592",
            {
              contract: "0xefe804a604fd3175220d5a4f2fc1a048c479c592",
              name: "PIXAPE",
              symbol: "$pixape",
              decimals: 18,
            },
          ],
          [
            "0x726516B20c4692a6beA3900971a37e0cCf7A6BFf",
            {
              contract: "0x726516B20c4692a6beA3900971a37e0cCf7A6BFf",
              name: "Frog Coin",
              symbol: "FRG",
              decimals: 18,
            },
          ],
          [
            "0x46898f15F99b8887D87669ab19d633F579939ad9",
            {
              contract: "0x46898f15F99b8887D87669ab19d633F579939ad9",
              name: "Ribbit",
              symbol: "RIBBIT",
              decimals: 18,
            },
          ],
        ]),
        coingecko: {
          networkId: "ethereum",
        },
        onStartup: async () => {
          // Insert the native currency
          await Promise.all([
            idb.none(
              `
                INSERT INTO currencies (
                  contract,
                  name,
                  symbol,
                  decimals,
                  metadata
                ) VALUES (
                  '\\x0000000000000000000000000000000000000000',
                  'Ether',
                  'ETH',
                  18,
                  '{"coingeckoCurrencyId": "ethereum", "image": "https://assets.coingecko.com/coins/images/279/large/ethereum.png"}'
                ) ON CONFLICT DO NOTHING
              `
            ),
          ]);
        },
      };
    // Goerli
    case 5: {
      return {
        ...defaultNetworkSettings,
        backfillBlockBatchSize: 128,
        washTradingExcludedContracts: [
          // ArtBlocks Contracts
          "0xda62f67be7194775a75be91cbf9feedcc5776d4b",
          // Sound.xyz Contracts
          "0xbe8f3dfce2fcbb6dd08a7e8109958355785c968b",
        ],
        multiCollectionContracts: [
          // ArtBlocks Contracts
          "0xda62f67be7194775a75be91cbf9feedcc5776d4b",
          // Sound.xyz Contracts
          "0xbe8f3dfce2fcbb6dd08a7e8109958355785c968b",
        ],
        supportedBidCurrencies: {
          ...defaultNetworkSettings.supportedBidCurrencies,
          // Backed USDC
          "0x68b7e050e6e2c7efe11439045c9d49813c1724b8": true,
        },
        onStartup: async () => {
          // Insert the native currency
          await Promise.all([
            idb.none(
              `
                INSERT INTO currencies (
                  contract,
                  name,
                  symbol,
                  decimals,
                  metadata
                ) VALUES (
                  '\\x0000000000000000000000000000000000000000',
                  'Ether',
                  'ETH',
                  18,
                  '{}'
                ) ON CONFLICT DO NOTHING
              `
            ),
          ]);
        },
      };
    }
    // Optimism
    case 10: {
      return {
        ...defaultNetworkSettings,
        enableWebSocket: false,
        enableReorgCheck: false,
        realtimeSyncFrequencySeconds: 10,
        realtimeSyncMaxBlockLag: 128,
        backfillBlockBatchSize: 512,
        coingecko: {
          networkId: "optimistic-ethereum",
        },
        onStartup: async () => {
          // Insert the native currency
          await Promise.all([
            idb.none(
              `
                INSERT INTO currencies (
                  contract,
                  name,
                  symbol,
                  decimals,
                  metadata
                ) VALUES (
                  '\\x0000000000000000000000000000000000000000',
                  'Ether',
                  'ETH',
                  18,
                  '{"coingeckoCurrencyId": "ethereum", "image": "https://assets.coingecko.com/coins/images/279/large/ethereum.png"}'
                ) ON CONFLICT DO NOTHING
              `
            ),
          ]);
        },
      };
    }
    // Polygon
    case 137: {
      return {
        ...defaultNetworkSettings,
        metadataMintDelay: 180,
        enableWebSocket: false,
        enableReorgCheck: true,
        realtimeSyncFrequencySeconds: 10,
        realtimeSyncMaxBlockLag: 128,
        backfillBlockBatchSize: 25,
        reorgCheckFrequency: [30],
        coingecko: {
          networkId: "polygon-pos",
        },
        supportedBidCurrencies: {
          ...defaultNetworkSettings.supportedBidCurrencies,
          // WETH
          "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619": true,
        },
        onStartup: async () => {
          // Insert the native currency
          await Promise.all([
            idb.none(
              `
                INSERT INTO currencies (
                  contract,
                  name,
                  symbol,
                  decimals,
                  metadata
                ) VALUES (
                  '\\x0000000000000000000000000000000000000000',
                  'Matic',
                  'MATIC',
                  18,
                  '{"coingeckoCurrencyId": "matic-network"}'
                ) ON CONFLICT DO NOTHING
              `
            ),
          ]);
        },
      };
    }
    // Default
    default:
      return {
        ...defaultNetworkSettings,
      };
  }
};
