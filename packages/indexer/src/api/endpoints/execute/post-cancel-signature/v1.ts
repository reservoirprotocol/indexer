import { arrayify } from "@ethersproject/bytes";
import { verifyMessage } from "@ethersproject/wallet";
import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import axios from "axios";
import Joi from "joi";

import { idb } from "@/common/db";
import { logger } from "@/common/logger";
import { fromBuffer } from "@/common/utils";
import { config } from "@/config/index";
import * as orderUpdatesById from "@/jobs/order-updates/by-id-queue";

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
      softCancel: Joi.boolean().default(false),
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

      if (query.softCancel) {
        // Check signature
        const signer = verifyMessage(arrayify(orderId), signature);
        if (signer.toLowerCase() !== fromBuffer(orderResult.maker)) {
          throw Boom.unauthorized("Invalid signature");
        }

        // Mark the order as cancelled
        await idb.none(
          `
            UPDATE orders SET
              fillability_status = 'cancelled',
              updated_at = now()
            WHERE orders.id = $/id/
          `,
          { id: query.id }
        );

        // Update any caches
        await orderUpdatesById.addToQueue([
          {
            context: `cancel-${query.id}`,
            id: query.id,
            trigger: {
              kind: "cancel",
            },
          } as orderUpdatesById.OrderInfo,
        ]);
      } else {
        await axios.post(
          `https://seaport-oracle-${
            config.chainId === 1 ? "mainnet" : "goerli"
          }.up.railway.app/api/cancellations`,
          {
            signature,
            orders: [orderResult.raw_data],
          }
        );
      }

      return { message: "Success" };
    } catch (error) {
      logger.error(`post-cancel-signature-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
