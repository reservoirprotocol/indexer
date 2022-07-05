/* eslint-disable no-fallthrough */

import { config } from "@/config/index";

export const getNetworkSettings = () => {
  switch (config.chainId) {
    // Ethereum
    case 1:
    // Rinkeby
    case 4: {
      return {
        realtimeSyncFrequencySeconds: 15,
        backfillBlockBatchSize: 16,
      };
    }

    // Optimism
    case 10: {
      return {
        realtimeSyncFrequencySeconds: 5,
        backfillBlockBatchSize: 512,
      };
    }

    default: {
      throw new Error("Unsupported chain id");
    }
  }
};
