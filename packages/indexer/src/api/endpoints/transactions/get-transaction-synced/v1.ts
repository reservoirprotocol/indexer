import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { idb } from "@/common/db";
import { logger } from "@/common/logger";
import { toBuffer } from "@/common/utils";

const version = "v1";

export const getTransactionSyncedV1Options: RouteOptions = {
  description: "Check Transaction Status",
  notes: "Get a boolean response on whether a particular transaction was synced or not.",
  tags: ["api", "Manage Orders"],
  plugins: {
    "hapi-swagger": {
      order: 10,
    },
  },
  validate: {
    params: Joi.object({
      txHash: Joi.string()
        .lowercase()
        .pattern(/^0x[a-fA-F0-9]{64}$/)
        .required(),
    }),
  },
  response: {
    schema: Joi.object({
      synced: Joi.boolean().required(),
    }).label(`getTransactionSynced${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(`get-transaction-synced-${version}-handler`, `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    const params = request.params as { txHash: string };

    const result = await idb.oneOrNone(
      `
        SELECT 1 FROM transactions
        WHERE transactions.hash = $/txHash/
      `,
      { txHash: toBuffer(params.txHash) }
    );

    if (result) {
      return { synced: true };
    } else {
      return { synced: false };
    }
  },
};
