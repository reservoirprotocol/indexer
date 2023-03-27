import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import axios from "axios";
import Joi from "joi";

import { idb } from "@/common/db";
import { logger } from "@/common/logger";
import { config } from "@/config/index";

const version = "v1";

export const postCancelSignatureV1Options: RouteOptions = {
  description: "Off-chain cancel an order",
  tags: ["api", "Misc"],
  plugins: {
    "hapi-swagger": {
      order: 50,
    },
  },
  validate: {
    query: Joi.object({
      signature: Joi.string().required().description("Cancellation signature"),
    }),
    payload: Joi.object({
      orderId: Joi.string().required().description("Id of the order to cancel"),
    }),
  },
  response: {
    schema: Joi.object({
      message: Joi.string(),
    }).label(`postPermitSignature${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(`post-permit-signature-${version}-handler`, `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    const query = request.query;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payload = request.payload as any;

    try {
      const signature = query.signature;
      const orderId = payload.orderId;

      const orderResult = await idb.oneOrNone(
        `
          SELECT
            orders.maker,
            orders.raw_data
          FROM orders
          WHERE orders.id = $/id/
        `,
        { id: orderId }
      );
      if (!orderResult) {
        throw Boom.badRequest("Unknown order");
      }

      await axios.post(
        `https://seaport-oracle-${
          config.chainId === 1 ? "mainnet" : "goerli"
        }.up.railway.app/api/cancellations`,
        {
          signature,
          orders: [orderResult.raw_data],
        }
      );

      return { message: "Success" };
    } catch (error) {
      logger.error(`post-cancel-signature-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
