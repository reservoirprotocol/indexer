/* eslint-disable no-fallthrough */

// Any new network that is supported should have a corresponding
// entry in the configuration methods below

import { idb } from "@/common/db";
import { config } from "@/config/index";

export const getNetworkName = () => {
  switch (config.chainId) {
    case 1:
      return "mainnet";
    case 4:
      return "rinkeby";
    case 5:
      return "goerli";
    case 10:
      return "optimism";
    default:
      return "unknown";
  }
};

type NetworkSettings = {
  enableWebSocket: boolean;
  enableReorgCheck: boolean;
  realtimeSyncFrequencySeconds: number;
  realtimeSyncMaxBlockLag: number;
  backfillBlockBatchSize: number;
  metadataMintDelay: number;
  enableMetadataAutoRefresh: boolean;
  washTradingExcludedContracts: string[];
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
  };

  switch (config.chainId) {
    // Ethereum
    case 1:
      return {
        ...defaultNetworkSettings,
        metadataMintDelay: 30,
        enableMetadataAutoRefresh: true,
        washTradingExcludedContracts: [
          // ArtBlocks Contracts
          "0x059edd72cd353df5106d2b9cc5ab83a52287ac3a",
          "0xa7d8d9ef8d8ce8992df33d8b8cf4aebabd5bd270",
        ],
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
                  '{"coingeckoCurrencyId": "ethereum"}'
                ) ON CONFLICT DO NOTHING
              `
            ),
          ]);
        },
      };
    // Rinkeby
    case 4:
      return {
        ...defaultNetworkSettings,
        backfillBlockBatchSize: 128,
      };
    // Goerli
    case 5: {
      return {
        ...defaultNetworkSettings,
        backfillBlockBatchSize: 128,
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
                  'Optimism',
                  'OP',
                  18,
                  '{"coingeckoCurrencyId": "optimism"}'
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
