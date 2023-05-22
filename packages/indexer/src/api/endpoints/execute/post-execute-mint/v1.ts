import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { idb } from "@/common/db";
import { logger } from "@/common/logger";
import { bn, fromBuffer, regex } from "@/common/utils";
import { Sources } from "@/models/sources";
import { getMintTxData } from "@/utils/mints/collection-mints";

const version = "v1";

export const postExecuteMintV1Options: RouteOptions = {
  description: "Mint tokens",
  tags: ["api", "x-deprecated"],
  plugins: {
    "hapi-swagger": {
      deprecated: true,
    },
  },
  validate: {
    payload: Joi.object({
      collection: Joi.string().lowercase().required().description("Collection to mint"),
      quantity: Joi.number()
        .integer()
        .positive()
        .default(1)
        .description("Quantity of tokens to mint"),
      taker: Joi.string()
        .lowercase()
        .pattern(regex.address)
        .required()
        .description(
          "Address of wallet minting. Example: `0xF296178d553C8Ec21A2fBD2c5dDa8CA9ac905A00`"
        ),
      source: Joi.string()
        .lowercase()
        .pattern(regex.domain)
        .description("Source used for attribution. Example: `reservoir.market`"),
      maxFeePerGas: Joi.string()
        .pattern(regex.number)
        .description("Optional. Set custom gas price."),
      maxPriorityFeePerGas: Joi.string()
        .pattern(regex.number)
        .description("Optional. Set custom gas price."),
    }),
  },
  response: {
    schema: Joi.object({
      steps: Joi.array().items(
        Joi.object({
          id: Joi.string().required(),
          action: Joi.string().required(),
          description: Joi.string().required(),
          kind: Joi.string().valid("signature", "transaction").required(),
          items: Joi.array()
            .items(
              Joi.object({
                status: Joi.string()
                  .valid("complete", "incomplete")
                  .required()
                  .description("Response is `complete` or `incomplete`."),
                tip: Joi.string(),
                orderIds: Joi.array().items(Joi.string()),
                data: Joi.object(),
              })
            )
            .required(),
        })
      ),
    }).label(`postExecuteMint${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(`post-execute-mint-${version}-handler`, `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payload = request.payload as any;

    try {
      const collection = payload.collection as string;
      const quantity = payload.quantity as number;

      const collectionMint = await idb.oneOrNone(
        `
          SELECT
            collections.contract,
            collection_mints.details,
            collection_mints.price
          FROM collection_mints
          JOIN collections
            ON collection_mints.collection_id = collections.id
          WHERE collection_mints.collection_id = $/collection/
        `,
        { collection }
      );
      if (!collectionMint) {
        throw Boom.badRequest("Minting not available on collection");
      }

      const txData = getMintTxData(
        collectionMint.details,
        payload.taker,
        fromBuffer(collectionMint.contract),
        quantity,
        collectionMint.price
      );

      if (payload.source) {
        const sources = await Sources.getInstance();
        const source = sources.getByDomain(payload.source);
        if (source) {
          txData.data += source.domainHash.slice(2);
        }
      }

      // Custom gas settings
      const maxFeePerGas = payload.maxFeePerGas
        ? bn(payload.maxFeePerGas).toHexString()
        : undefined;
      const maxPriorityFeePerGas = payload.maxPriorityFeePerGas
        ? bn(payload.maxPriorityFeePerGas).toHexString()
        : undefined;

      return {
        steps: [
          {
            id: "mint",
            action: "Confirm transaction in your wallet",
            description: "To mint this item you must confirm the transaction and pay the gas fee",
            kind: "transaction",
            items: [
              {
                status: "incomplete",
                data: {
                  ...txData,
                  maxFeePerGas,
                  maxPriorityFeePerGas,
                },
              },
            ],
          },
        ],
      };
    } catch (error) {
      logger.error(`post-execute-mint-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
