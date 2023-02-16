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
  return `indexer-${config.version}-${getNetworkName()}`;
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
  customTokenAddresses: string[];
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
    customTokenAddresses: [],
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
        customTokenAddresses: [
          "0x95784f7b5c8849b0104eaf5d13d6341d8cc40750",
          "0xc9cb0fee73f060db66d2693d92d75c825b1afdbf",
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
            "0x726516b20c4692a6bea3900971a37e0ccf7a6bff",
            {
              contract: "0x726516b20c4692a6bea3900971a37e0ccf7a6bff",
              name: "Frog Coin",
              symbol: "FRG",
              decimals: 18,
            },
          ],
          [
            "0x46898f15f99b8887d87669ab19d633f579939ad9",
            {
              contract: "0x46898f15f99b8887d87669ab19d633f579939ad9",
              name: "Ribbit",
              symbol: "RIBBIT",
              decimals: 18,
            },
          ],
          [
            "0x4c7c1ec97279a6f3323eab9ab317202dee7ad922",
            {
              contract: "0x4c7c1ec97279a6f3323eab9ab317202dee7ad922",
              name: "FEWL",
              symbol: "FEWL",
              decimals: 18,
              metadata: {
                image:
                  "https://assets.website-files.com/630596599d87c526f9ca6d98/639b38c2171a4bf1981961d5_metaflyer-logomark-large-yellow.png",
              },
            },
          ],
          [
            "0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9",
            {
              contract: "0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9",
              name: "Aave Token",
              symbol: "AAVE",
              decimals: 18,
            }
          ],
          [
            "0x4d224452801aced8b2f0aebe155379bb5d594381",
            {
              contract: "0x4d224452801aced8b2f0aebe155379bb5d594381",
              name: "ApeCoin",
              symbol: "APE",
              decimals: 18,
            }
          ],
          [
            "0x823556202e86763853b40e9cde725f412e294689",
            {
              contract: "0x823556202e86763853b40e9cde725f412e294689",
              name: "Altered State Machine Utility Token",
              symbol: "ASTO",
              decimals: 18,
            }
          ],
          [
            "0x0391d2021f89dc339f60fff84546ea23e337750f",
            {
              contract: "0x0391d2021f89dc339f60fff84546ea23e337750f",
              name: "BarnBridge Governance Token",
              symbol: "BOND",
              decimals: 18,
            }
          ],
          [
            "0xd779eea9936b4e323cddff2529eb6f13d0a4d66e",
            {
              contract: "0xd779eea9936b4e323cddff2529eb6f13d0a4d66e",
              name: "ENTER Governance Token",
              symbol: "ENTR",
              decimals: 18,
            }
          ],
          [
            "0xed1480d12be41d92f36f5f7bdd88212e381a3677",
            {
              contract: "0xed1480d12be41d92f36f5f7bdd88212e381a3677",
              name: "FIAT DAO Token",
              symbol: "FDT",
              decimals: 18,
            }
          ],
          [
            "0x767fe9edc9e0df98e07454847909b5e959d7ca0e",
            {
              contract: "0x767fe9edc9e0df98e07454847909b5e959d7ca0e",
              name: "Illuvium",
              symbol: "ILV",
              decimals: 18,
            }
          ],
          [
            "0x7b39917f9562c8bc83c7a6c2950ff571375d505d",
            {
              contract: "0x7b39917f9562c8bc83c7a6c2950ff571375d505d",
              name: "LeagueDAO Governance Token",
              symbol: "LEAG",
              decimals: 18,
            }
          ],
          [
            "0x514910771af9ca656af840dff83e8264ecf986ca",
            {
              contract: "0x514910771af9ca656af840dff83e8264ecf986ca",
              name: "ChainLink Token",
              symbol: "LINK",
              decimals: 18,
            }
          ],
          [
            "0x0f5d2fb29fb7d3cfee444a200298f468908cc942",
            {
              contract: "0x0f5d2fb29fb7d3cfee444a200298f468908cc942",
              name: "Decentraland",
              symbol: "MANA",
              decimals: 18,
            }
          ],
          [
            "0x3845badade8e6dff049820680d1f14bd3903a5d0",
            {
              contract: "0x3845badade8e6dff049820680d1f14bd3903a5d0",
              name: "SAND",
              symbol: "SAND",
              decimals: 18,
            }
          ],
          [
            "0xc011a73ee8576fb46f5e1c5751ca3b9fe0af2a6f",
            {
              contract: "0xc011a73ee8576fb46f5e1c5751ca3b9fe0af2a6f",
              name: "Synthetix Network Token",
              symbol: "SNX",
              decimals: 18,
            }
          ],
          [
            "0xf293d23bf2cdc05411ca0eddd588eb1977e8dcd4",
            {
              contract: "0xf293d23bf2cdc05411ca0eddd588eb1977e8dcd4",
              name: "Sylo",
              symbol: "SYLO",
              decimals: 18,
            }
          ],
          [
            "0x618679df9efcd19694bb1daa8d00718eacfa2883",
            {
              contract: "0x618679df9efcd19694bb1daa8d00718eacfa2883",
              name: "XYZ Governance Token",
              symbol: "XYZ",
              decimals: 18,
            }
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
        enableWebSocket: true,
        enableReorgCheck: true,
        realtimeSyncFrequencySeconds: 10,
        realtimeSyncMaxBlockLag: 30,
        backfillBlockBatchSize: 60,
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
