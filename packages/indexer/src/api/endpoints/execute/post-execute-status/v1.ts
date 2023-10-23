import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import axios from "axios";
import Joi from "joi";

import { idb } from "@/common/db";
import { logger } from "@/common/logger";
import { toBuffer } from "@/common/utils";
import { config } from "@/config/index";

const version = "v1";

export const postExecuteStatusV1Options: RouteOptions = {
  description: "Get the status of an execution",
  tags: ["api", "Misc"],
  plugins: {
    "hapi-swagger": {
      order: 50,
    },
  },
  validate: {
    payload: Joi.alternatives(
      Joi.object({
        kind: Joi.string().valid("transaction").required(),
        hash: Joi.string().required(),
      }),
      Joi.object({
        kind: Joi.string().valid("seaport-v1.5-intent").required(),
        hash: Joi.string().required(),
      })
    ),
  },
  response: {
    schema: Joi.object({
      status: Joi.string().valid("unknown", "pending", "success", "failure").required(),
      details: Joi.string(),
      time: Joi.number(),
    }).label(`postExecuteStatus${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(`post-execute-status-${version}-handler`, `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payload = request.payload as any;

    try {
      switch (payload.kind) {
        case "transaction": {
          const result = await idb.oneOrNone(
            `
              SELECT 1 FROM transactions
              WHERE transactions.hash = $/hash/
            `,
            { hash: toBuffer(payload.hash) }
          );
          if (result) {
            return { status: "success" };
          } else {
            return { status: "unknown" };
          }
        }

        case "seaport-v1.5-intent": {
          const result: {
            status: string;
            details?: string;
            time?: number;
          } = await axios
            .get(`${config.solverBaseUrl}/intents/seaport/status?hash=${payload.hash}`)
            .then((response) => response.data);

          return {
            status: result.status,
            details: result.details,
            time: result.time,
          };
        }

        default: {
          throw Boom.badRequest("Unknown kind");
        }
      }
    } catch (error) {
      logger.error(`post-execute-status-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
