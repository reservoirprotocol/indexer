import axios from "axios";
import { config } from "@/config/index";
import { logger } from "@/common/logger";

export class AlchemyApi {
  public static supportedChains = [0];

  public static getBaseUrl() {
    switch (config.chainId) {
      case 1:
        return `https://eth-mainnet.g.alchemy.com/nft/v2/`;

      case 137:
        return `https://polygon-mainnet.g.alchemy.com/nft/v2/`;
    }
  }

  public static async getSpamContracts(): Promise<string[]> {
    // Supported only on mainnet and polygon
    if (!AlchemyApi.supportedChains.includes(config.chainId)) {
      return [];
    }

    const { data } = await axios
      .get(`${AlchemyApi.getBaseUrl()}${config.alchemyApiKey}/getSpamContracts`, {
        timeout: 60000,
      })
      .catch((error) => {
        logger.error("alchemy-api", `failed to get spam contracts, error=${error}`);
        return { data: [] };
      });

    return data;
  }

  public static async isSpamContract(contract: string): Promise<boolean> {
    // Supported only on mainnet and polygon
    if (!AlchemyApi.supportedChains.includes(config.chainId)) {
      return false;
    }

    const { data } = await axios
      .get(`${AlchemyApi.getBaseUrl()}${config.alchemyApiKey}/isSpamContract`, {
        params: { contractAddress: contract },
        timeout: 5000,
      })
      .catch((error) => {
        logger.error("alchemy-api", `failed to check if spam contract ${contract}, error=${error}`);
        return { data: false };
      });

    return data;
  }
}
