/* eslint-disable @typescript-eslint/no-explicit-any */

import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { inject } from "@/api/index";
import { redb } from "@/common/db";
import { logger } from "@/common/logger";
import { toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import { genericTaker, simulateBuyTx } from "@/utils/tenderly";

export const postSimulateFloor: RouteOptions = {
  description: "Simulate the floor ask of any token for guaranteed fillability coverage",
  tags: ["api", "x-admin"],
  timeout: {
    server: 2 * 60 * 1000,
  },
  validate: {
    headers: Joi.object({
      "x-admin-api-key": Joi.string().required(),
    }).options({ allowUnknown: true }),
    payload: Joi.object({
      token: Joi.string()
        .lowercase()
        .pattern(/^0x[a-fA-F0-9]{40}:[0-9]+$/),
    }),
  },
  handler: async (request: Request) => {
    if (request.headers["x-admin-api-key"] !== config.adminApiKey) {
      throw Boom.unauthorized("Wrong or missing admin API key");
    }

    const payload = request.payload as any;

    try {
      const token = payload.token;

      const response = await inject({
        method: "GET",
        url: `/execute/buy/v2?token=${token}&taker=${genericTaker}&skipBalanceCheck=true`,
        headers: {
          "Content-Type": "application/json",
        },
      });

      const contractResult = await redb.one(
        `
          SELECT
            contracts.kind
          FROM contracts
          WHERE contracts.address = $/contract/
        `,
        { contract: toBuffer(token.split(":")[0]) }
      );

      const simulationResult = await simulateBuyTx(
        contractResult.kind,
        JSON.parse(response.payload).steps[0].data
      );
      if (simulationResult.success) {
        return { message: "Order is fillable" };
      } else {
        return { message: "Order is not fillable" };
      }
    } catch (error) {
      logger.error("post-simulate-floor-handler", `Handler failure: ${error}`);
      throw error;
    }
  },
};
