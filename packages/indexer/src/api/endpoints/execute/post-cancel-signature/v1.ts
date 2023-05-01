import { keccak256 } from "@ethersproject/solidity";
import { verifyMessage } from "@ethersproject/wallet";
import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import axios from "axios";
import Joi from "joi";

import { idb } from "@/common/db";
import { logger } from "@/common/logger";
import { config } from "@/config/index";
import * as b from "@/utils/auth/blur";

const version = "v1";

export const postCancelSignatureV1Options: RouteOptions = {
  description: "Off-chain cancel orders",
  tags: ["api", "Misc"],
  plugins: {
    "hapi-swagger": {
      order: 50,
    },
  },
  validate: {
    query: Joi.object({
      signature: Joi.string().required().description("Cancellation signature"),
      auth: Joi.string().description("Optional auth token used instead of the signature"),
    }),
    payload: Joi.object({
      orderIds: Joi.array()
        .items(Joi.string())
        .min(1)
        .required()
        .description("Ids of the orders to cancel"),
      orderKind: Joi.string()
        .valid("seaport-v1.4", "alienswap", "blur-bid")
        .default("seaport-v1.4")
        .description("Exchange protocol used to bulk cancel order. Example: `seaport-v1.4`"),
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
      const orderIds = payload.orderIds;
      const orderKind = payload.orderKind;

      let auth = query.auth;
      switch (orderKind) {
        case "blur-bid": {
          let globalMaker: string | undefined;
          const bidsByContract: { [contract: string]: string[] } = {};
          for (const orderId of orderIds) {
            const [, maker, contract, price] = orderId.split(":");

            if (!globalMaker) {
              globalMaker = maker;
            } else if (maker !== globalMaker) {
              throw Boom.badRequest("All orders must have the same maker");
            }

            if (!bidsByContract[contract]) {
              bidsByContract[contract] = [];
            }
            bidsByContract[contract].push(price);
          }

          if (!auth) {
            const signer = verifyMessage(keccak256(["string[]"], [orderIds.sort()]), signature);
            if (globalMaker?.toLowerCase() !== signer.toLowerCase()) {
              throw Boom.unauthorized("Invalid signature");
            }

            auth = await b.getAuth(b.getAuthId(signer)).then((a) => a?.accessToken);
          }

          await Promise.all(
            Object.entries(bidsByContract).map(async ([contract, prices]) => {
              await axios.post(`${config.orderFetcherBaseUrl}/api/blur-cancel-collection-bids`, {
                maker: globalMaker,
                contract,
                prices,
                authToken: auth,
              });
            })
          );

          return { message: "Success" };
        }

        case "alienswap":
        case "seaport-v1.4": {
          const ordersResult = await idb.manyOrNone(
            `
              SELECT
                orders.maker,
                orders.raw_data
              FROM orders
              WHERE orders.id IN ($/ids:list/)
              ORDER BY orders.id
            `,
            { ids: orderIds }
          );
          if (ordersResult.length !== orderIds.length) {
            throw Boom.badRequest("Could not find all relevant orders");
          }

          try {
            await axios.post(
              `https://seaport-oracle-${
                config.chainId === 1 ? "mainnet" : "goerli"
              }.up.railway.app/api/cancellations`,
              {
                signature,
                orders: ordersResult.map((o) => o.raw_data),
                orderKind,
              }
            );

            return { message: "Success" };
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } catch (error: any) {
            if (error.response?.data) {
              throw Boom.badRequest(error.response.data.message);
            }

            throw Boom.badRequest("Cancellation failed");
          }
        }
      }
    } catch (error) {
      logger.error(`post-cancel-signature-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
