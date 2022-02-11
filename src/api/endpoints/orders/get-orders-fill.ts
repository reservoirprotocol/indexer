import { Request, RouteOptions } from "@hapi/hapi";
import * as Sdk from "@reservoir0x/sdk";
import Joi from "joi";

import { wyvernV2OrderFormat } from "@/api/types";
import { db } from "@/common/db";
import { logger } from "@/common/logger";
import { config } from "@/config/index";
import * as queries from "@/entities/orders/get-best-order";

export const getOrdersFillOptions: RouteOptions = {
  description:
    "Get the best available order for buying or selling a token. The response can be passed to the SDK for signing.",
  tags: ["api", "x-deprecated"],
  validate: {
    query: Joi.object({
      tokenId: Joi.string()
        .pattern(/^[0-9]+$/)
        .required(),
      contract: Joi.string()
        .lowercase()
        .pattern(/^0x[a-f0-9]{40}$/)
        .required(),
      side: Joi.string().lowercase().valid("sell", "buy").default("sell"),
    }),
  },
  response: {
    schema: Joi.object({
      order: Joi.object({
        // TODO: When time comes, add support for other order formats
        // apart from WyvernV2 which is the only one supported for now
        params: wyvernV2OrderFormat,
        buildMatchingArgs: Joi.array().items(Joi.any()),
      }).allow(null),
    }).label("getOrdersFillResponse"),
    failAction: (_request, _h, error) => {
      logger.error(
        "get_orders_fill_handler",
        `Wrong response schema: ${error}`
      );
      throw error;
    },
  },
  handler: async (request: Request) => {
    const query = request.query as any;

    try {
      const bestOrder = await queries.getBestOrder(
        query as queries.GetBestOrderFilter
      );

      if (!bestOrder) {
        return { order: null };
      }

      const sdkOrder = new Sdk.WyvernV2.Order(
        config.chainId,
        bestOrder.rawData
      );

      const buildMatchingArgs: any[] = [];
      if (
        sdkOrder.params.kind?.endsWith("token-range") ||
        sdkOrder.params.kind?.endsWith("contract-wide")
      ) {
        // Pass the token id to match
        buildMatchingArgs.push(query.tokenId);
      }
      if (sdkOrder.params.kind?.endsWith("token-list")) {
        // Pass the token id to match
        buildMatchingArgs.push(query.tokenId);

        const tokens: { token_id: string }[] = await db.manyOrNone(
          `
            select "tst"."token_id" from "token_sets_tokens" "tst"
            where "tst"."token_set_id" = $/tokenSetId/
          `,
          { tokenSetId: bestOrder.tokenSetId }
        );

        // Pass the list of tokens of the underlying filled order
        buildMatchingArgs.push(tokens.map(({ token_id }) => token_id));
      }

      return {
        order: {
          params: sdkOrder.params,
          buildMatchingArgs,
        },
      };
    } catch (error) {
      logger.error("get_orders_fill_handler", `Handler failure: ${error}`);
      throw error;
    }
  },
};
