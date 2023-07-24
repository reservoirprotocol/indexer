import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { inject } from "@/api/index";
import { idb } from "@/common/db";
import { logger } from "@/common/logger";
import { regex } from "@/common/utils";
import { saveExecutionResult } from "@/utils/executions";

const version = "v1";

export const postExecuteResultsV1: RouteOptions = {
  description: "Send the success status of an execution",
  tags: ["api", "Misc"],
  plugins: {
    "hapi-swagger": {
      order: 50,
    },
  },
  validate: {
    payload: Joi.object({
      requestId: Joi.string()
        .required()
        .description("Request id of the associate execute API request"),
      stepId: Joi.string().required().description("Step id of the relevant execute item"),
      txHash: Joi.string().pattern(regex.bytes32).description("Associated transaction hash"),
      errorMessage: Joi.string().description("Associated error message"),
    }).or("txHash", "errorMessage"),
  },
  response: {
    schema: Joi.object({
      message: Joi.string().required(),
    }).label(`postExecuteResults${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(`post-execute-results-${version}-handler`, `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payload = request.payload as any;

    try {
      await saveExecutionResult({
        requestId: payload.requestId,
        stepId: payload.stepId,
        apiKey: request.headers["x-api-key"],
        txHash: payload.txHash,
        errorMessage: payload.errorMessage,
      });

      if (payload.errorMessage) {
        // Refresh all tokens
        const results = await idb.manyOrNone(
          `
            SELECT
              orders.token_set_id
            FROM executions
            JOIN orders
              ON executions.order_id = orders.id
            WHERE executions.request_id = $/requestId/
          `,
          {
            requestId: payload.requestId,
          }
        );
        await Promise.all(
          results.map(async (r) => {
            // TODO: Add support for all token sets
            if (r.token_set_id.startsWith("token")) {
              const token = r.token_set_id.split(":").slice(1).join(":");
              await inject({
                method: "POST",
                url: `/tokens/refresh/v1`,
                headers: {
                  "Content-Type": "application/json",
                },
                payload: {
                  token,
                  liquidityOnly: true,
                },
              });
            }
          })
        );
      }

      return { message: "Success" };
    } catch (error) {
      logger.error(`post-execution-results-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
