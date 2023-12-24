import axios from "axios";

import { ridb } from "@/common/db";
import { logger } from "@/common/logger";
import { fromBuffer } from "@/common/utils";
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

  static async fastContractSync(collectionId: string) {
    const results = await ridb.manyOrNone(
      `
        SELECT
          collections.contract,
          collections.slug
        FROM collections
        WHERE collections.id = $/collectionId/
      `,
      {
        collectionId: collectionId,
      }
    );

    return Promise.all(
      results.map((r) =>
        axios
          .post(`${config.openseaIndexerApiBaseUrl}/fast-contract-sync`, {
            contract: fromBuffer(r.contract),
            slug: r.slug,
          })
          .catch((error) => {
            logger.error(
              "fast_contract_sync",
              `Failed to sync collectionId=${collectionId}, slug=${r.slug}, error=${error}`
            );
            return false;
          })
      )
    );
  }
}

export { OpenseaIndexerApi as default };
