import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

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

      return { message: "Success" };
    } catch (error) {
      logger.error(`post-execution-results-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
