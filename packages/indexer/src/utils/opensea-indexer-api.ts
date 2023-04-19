import axios from "axios";

import { logger } from "@/common/logger";
import { config } from "@/config/index";

export class OpenseaIndexerApi {
  static async fastTokenSync(token: string) {
    return axios
      .post(`${config.openseaIndexerApiBaseUrl}/fast-token-sync`, { token }, { timeout: 60000 })
      .catch((error) => {
        logger.error("fast_token_sync", `Failed to sync token=${token}, error=${error}`);
        return false;
      });
  }

  static async fastContractSync(contract: string) {
    return axios
      .post(
        `${config.openseaIndexerApiBaseUrl}/fast-contract-sync`,
        { contract },
        { timeout: 60000 }
      )
      .catch((error) => {
        logger.error("fast_contract_sync", `Failed to sync contract=${contract}, error=${error}`);
        return false;
      });
  }
}

export { OpenseaIndexerApi as default };
