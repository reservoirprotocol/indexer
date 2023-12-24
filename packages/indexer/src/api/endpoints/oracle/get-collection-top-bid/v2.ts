import { defaultAbiCoder } from "@ethersproject/abi";
import { arrayify } from "@ethersproject/bytes";
import { AddressZero } from "@ethersproject/constants";
import { _TypedDataEncoder } from "@ethersproject/hash";
import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import * as Sdk from "@reservoir0x/sdk";
import Joi from "joi";

import { edb, redb } from "@/common/db";
import { logger } from "@/common/logger";
import { Signers, addressToSigner } from "@/common/signers";
import { bn, formatPrice, now, regex, safeOracleTimestamp, toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import { getUSDAndNativePrices } from "@/utils/prices";

const version = "v2";

export const getCollectionTopBidOracleV2Options: RouteOptions = {
  description: "Collection top bid oracle",
  notes:
    "Get a signed message of any collection's top bid price (spot or twap). The oracle's address is 0xAeB1D03929bF87F69888f381e73FBf75753d75AF. The address is the same for all chains.",
  tags: ["api", "x-deprecated"],
  plugins: {
    "hapi-swagger": {
      deprecated: true,
    },
  },
  validate: {
    query: Joi.object({
      kind: Joi.string().valid("spot", "twap", "lower", "upper").default("spot"),
      currency: Joi.string().lowercase().default(AddressZero),
      twapSeconds: Joi.number()
        .greater(0)
        .default(24 * 3600),
      collection: Joi.string().lowercase(),
      token: Joi.string().pattern(regex.token).lowercase(),
      signer: Joi.string().valid(Signers.V1, Signers.V2).default(Signers.V2),
    })
      .or("collection", "token")
      .oxor("collection", "token"),
  },
  response: {
    schema: Joi.object({
      price: Joi.number().unsafe().required(),
      message: Joi.object({
        id: Joi.string().required(),
        payload: Joi.string().required(),
        timestamp: Joi.number().required(),
        signature: Joi.string().required(),
      }),
    }).label(`getCollectionTopBidOracle${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(
        `get-collection-top-bid-oracle-${version}-handler`,
        `Wrong response schema: ${error}`
      );
      throw error;
    },
  },
  handler: async (request: Request) => {
    const query = request.query;

    if (query.token) {
      const [contract, tokenId] = query.token.split(":");
      const collectionResult = await edb.oneOrNone(
        `
          SELECT
            tokens.collection_id
          FROM tokens
          WHERE tokens.contract = $/contract/
            AND tokens.token_id = $/tokenId/
        `,
        {
          contract: toBuffer(contract),
          tokenId,
        }
      );

      if (collectionResult) {
        query.collection = collectionResult.collection_id;
      } else {
        throw new Error("Token is not associated to any collection");
      }
    }

    try {
      const collectionHasTopBid = await redb.oneOrNone(
        `
          SELECT
            1
          FROM orders
          JOIN token_sets
            ON orders.token_set_id = token_sets.id
          WHERE orders.side = 'buy'
            AND orders.fillability_status = 'fillable'
            AND orders.approval_status = 'approved'
            AND token_sets.collection_id = $/collection/
            AND token_sets.attribute_id IS NULL
          LIMIT 1
        `,
        {
          collection: query.collection,
        }
      );
      if (!collectionHasTopBid) {
        throw Boom.badRequest("Collection has no top bid");
      }

      const spotQuery = `
        SELECT
          e.price
        FROM collection_top_bid_events e
        WHERE e.collection_id = $/collection/
        ORDER BY e.created_at DESC
        LIMIT 1
      `;

      const twapQuery = `
        WITH
          x AS (
            SELECT
              e.*
            FROM collection_top_bid_events e
            WHERE e.collection_id = $/collection/
              AND e.created_at >= now() - interval '${query.twapSeconds} seconds'
            ORDER BY e.created_at
          ),
          y AS (
            SELECT
              e.*
            FROM collection_top_bid_events e
            WHERE e.collection_id = $/collection/
              AND e.created_at < (SELECT COALESCE(MIN(x.created_at), 'Infinity') FROM x)
            ORDER BY e.created_at DESC
            LIMIT 1
          ),
          z AS (
            SELECT * FROM x
            UNION ALL
            SELECT * FROM y
          ),
          w AS (
            SELECT
              price,
              floor(extract('epoch' FROM greatest(z.created_at, now() - interval '${query.twapSeconds} seconds'))) AS start_time,
              floor(extract('epoch' FROM coalesce(lead(z.created_at, 1) OVER (ORDER BY created_at), now()))) AS end_time
            FROM z
          )
          SELECT
            floor(
              SUM(w.price * (w.end_time - w.start_time)) / (MAX(w.end_time) - MIN(w.start_time))
            )::NUMERIC(78, 0) AS price
          FROM w
      `;

      enum PriceKind {
        SPOT,
        TWAP,
        LOWER,
        UPPER,
      }

      let kind: PriceKind;
      let price: string;
      let decimals = 18;
      if (query.kind === "spot") {
        const result = await redb.oneOrNone(spotQuery, query);
        if (!result?.price) {
          throw Boom.badRequest("No top bid available");
        }

        kind = PriceKind.SPOT;
        price = result.price;
      } else if (query.kind === "twap") {
        const result = await redb.oneOrNone(twapQuery, query);
        if (!result?.price) {
          throw Boom.badRequest("No top bid available");
        }

        kind = PriceKind.TWAP;
        price = result.price;
      } else {
        const spotResult = await redb.oneOrNone(spotQuery, query);
        const twapResult = await redb.oneOrNone(twapQuery, query);
        if (!spotResult?.price || !twapResult?.price) {
          throw Boom.badRequest("No top bid available");
        }

        if (query.kind === "lower") {
          kind = PriceKind.LOWER;
          price = bn(spotResult.price).lt(twapResult.price) ? spotResult.price : twapResult.price;
        } else {
          kind = PriceKind.UPPER;
          price = bn(spotResult.price).gt(twapResult.price) ? spotResult.price : twapResult.price;
        }
      }

      // Use EIP-712 structured hashing (https://eips.ethereum.org/EIPS/eip-712)
      const EIP712_TYPES = {
        Message: {
          Message: [
            { name: "id", type: "bytes32" },
            { name: "payload", type: "bytes" },
            { name: "timestamp", type: "uint256" },
          ],
        },
        ContractWideCollectionTopBidPrice: {
          ContractWideCollectionTopBidPrice: [
            { name: "kind", type: "uint8" },
            { name: "twapSeconds", type: "uint256" },
            { name: "contract", type: "address" },
          ],
        },
        TokenRangeCollectionTopBidPrice: {
          TokenRangeCollectionTopBidPrice: [
            { name: "kind", type: "uint8" },
            { name: "twapSeconds", type: "uint256" },
            { name: "startTokenId", type: "uint256" },
            { name: "endTokenId", type: "uint256" },
          ],
        },
        CollectionTopBidPriceByToken: {
          CollectionTopBidPriceByToken: [
            { name: "kind", type: "uint8" },
            { name: "twapSeconds", type: "uint256" },
            { name: "token", type: "address" },
            { name: "tokenId", type: "uint256" },
          ],
        },
      };

      let id: string;
      if (query.token) {
        const [token, tokenId] = query.token.split(":");
        id = _TypedDataEncoder.hashStruct(
          "CollectionTopBidPriceByToken",
          EIP712_TYPES.CollectionTopBidPriceByToken,
          {
            kind,
            twapSeconds: query.twapSeconds,
            token,
            tokenId,
          }
        );
      } else if (query.collection.includes(":")) {
        const [contract, startTokenId, endTokenId] = query.collection.split(":");
        id = _TypedDataEncoder.hashStruct(
          "TokenRangeCollectionTopBidPrice",
          EIP712_TYPES.TokenRangeCollectionTopBidPrice,
          {
            kind,
            twapSeconds: query.twapSeconds,
            contract,
            startTokenId,
            endTokenId,
          }
        );
      } else {
        id = _TypedDataEncoder.hashStruct(
          "ContractWideCollectionTopBidPrice",
          EIP712_TYPES.ContractWideCollectionTopBidPrice,
          {
            kind,
            twapSeconds: query.twapSeconds,
            contract: query.collection,
          }
        );
      }

      if (Object.values(Sdk.Common.Addresses.Native).includes(query.currency)) {
        // ETH: do nothing
      } else if (Object.values(Sdk.Common.Addresses.WNative).includes(query.currency)) {
        // WETH: do nothing
      } else if (Object.values(Sdk.Common.Addresses.Usdc).flat().includes(query.currency)) {
        // USDC: convert price to USDC
        const convertedPrices = await getUSDAndNativePrices(
          Sdk.Common.Addresses.Native[config.chainId],
          price,
          now(),
          {
            onlyUSD: true,
            acceptStalePrice: true,
          }
        );

        // USDC has 6 decimals
        price = convertedPrices.usdPrice!;
        decimals = 6;
      } else {
        throw Boom.badRequest("Unsupported currency");
      }

      const message: {
        id: string;
        payload: string;
        timestamp: number;
        signature?: string;
      } = {
        id,
        payload: defaultAbiCoder.encode(["address", "uint256"], [query.currency, price]),
        timestamp: await safeOracleTimestamp(),
      };

      if (config.oraclePrivateKey) {
        message.signature = await addressToSigner[query.signer]().signMessage(
          arrayify(_TypedDataEncoder.hashStruct("Message", EIP712_TYPES.Message, message))
        );
      } else {
        throw Boom.badRequest("Instance cannot act as oracle");
      }

      return {
        price: formatPrice(price, decimals),
        message,
      };
    } catch (error) {
      if (!(error instanceof Boom.Boom)) {
        logger.error(
          `get-collection-top-bid-oracle-${version}-handler`,
          `Handler failure: ${error}`
        );
      }
      throw error;
    }
  },
};
