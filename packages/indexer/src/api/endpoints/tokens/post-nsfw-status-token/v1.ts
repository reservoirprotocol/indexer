/* eslint-disable @typescript-eslint/no-explicit-any */

import { Request, RouteOptions } from "@hapi/hapi";
import { fromBuffer, regex, toBuffer } from "@/common/utils";
import Joi from "joi";
import * as Boom from "@hapi/boom";
import { logger } from "@/common/logger";
import { ApiKeyManager } from "@/models/api-keys";
import _ from "lodash";
import { idb, pgp } from "@/common/db";
import {
  ActionsLogContext,
  ActionsLogOrigin,
  actionsLogJob,
} from "@/jobs/general-tracking/actions-log-job";

const version = "v1";

export const postNsfwStatusTokenV1Options: RouteOptions = {
  description: "Update the tokens nsfw status",
  notes: "This API can be used by allowed API keys to update the nsfw status of a token.",
  tags: ["api", "Management"],
  plugins: {
    "hapi-swagger": {
      order: 13,
    },
  },
  timeout: {
    server: 2 * 60 * 1000,
  },
  validate: {
    headers: Joi.object({
      "x-api-key": Joi.string().required(),
    }).options({ allowUnknown: true }),
    payload: Joi.object({
      tokens: Joi.alternatives()
        .try(
          Joi.array()
            .max(50)
            .items(Joi.string().lowercase().pattern(regex.token))
            .description(
              "Array of tokens. Max limit is 50. Example: `tokens[0]: 0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63:704 tokens[1]: 0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63:979`"
            ),
          Joi.string()
            .lowercase()
            .pattern(regex.token)
            .description(
              "Array of tokens. Max limit is 50. Example: `tokens[0]: 0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63:704 tokens[1]: 0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63:979`"
            )
        )
        .required(),
      nsfw: Joi.boolean().description("The new status of the nsfw").default(true),
    }),
  },
  response: {
    schema: Joi.object({
      message: Joi.string(),
    }).label(`postNsfwStatusToken${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(`post-nsfw-status-token-${version}-handler`, `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    const payload = request.payload as any;
    let updateResult;

    try {
      const apiKey = await ApiKeyManager.getApiKey(request.headers["x-api-key"]);

      if (_.isNull(apiKey)) {
        throw Boom.unauthorized("Invalid API key");
      }

      if (!apiKey.permissions?.update_nsfw_status) {
        throw Boom.unauthorized("Not allowed");
      }

      if (!_.isArray(payload.tokens)) {
        payload.tokens = [payload.tokens];
      }

      const newNsfwStatus = Number(payload.nsfw) ? 100 : -100;

      const query = `
        UPDATE tokens
        SET nsfw_status = $/nsfwStatus/, updated_at = NOW()
        WHERE (contract, token_id) IN (${pgp.helpers.values(
          payload.tokens.map((t: string) => ({
            contract: toBuffer(t.split(":")[0]),
            tokenId: t.split(":")[1],
          })),
          new pgp.helpers.ColumnSet(["contract", "tokenId"])
        )})
        AND nsfw_status IS DISTINCT FROM $/nsfwStatus/
        RETURNING contract, token_id
      `;

      updateResult = await idb.manyOrNone(query, {
        nsfwStatus: newNsfwStatus,
      });

      if (updateResult) {
        // Track the change
        await actionsLogJob.addToQueue(
          updateResult.map((res) => ({
            context: ActionsLogContext.NsfwTokenUpdate,
            origin: ActionsLogOrigin.API,
            actionTakerIdentifier: apiKey.key,
            contract: fromBuffer(res.contract),
            tokenId: res.token_id,
            data: {
              newNsfwStatus,
            },
          }))
        );
      }

      return {
        message: `Update nsfw status for tokens ${JSON.stringify(payload.tokens)} request accepted`,
      };
    } catch (error) {
      logger.error(`post-nsfw-status-token-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
