/* eslint-disable @typescript-eslint/no-explicit-any */

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

const version = "v4";

export const getCollectionFloorAskOracleV4Options: RouteOptions = {
  description: "Collection floor",
  notes:
    "Get a signed message of any collection's floor price (spot or twap). The oracle's address is 0x32dA57E736E05f75aa4FaE2E9Be60FD904492726.",
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
      eip3668Calldata: Joi.string(),
      collection: Joi.string().lowercase(),
      token: Joi.string().pattern(regex.token).lowercase(),
      useNonFlaggedFloorAsk: Joi.boolean()
        .default(false)
        .description("If true, will use the collection non flagged floor ask events."),
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
      data: Joi.string(),
    }).label(`getCollectionFloorAskOracle${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(
        `get-collection-floor-ask-oracle-${version}-handler`,
        `Wrong response schema: ${error}`
      );
      throw error;
    },
  },
  handler: async (request: Request) => {
    const query = request.query as any;

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
        throw Boom.badRequest("Token is not associated to any collection");
      }
    }

    if (query.eip3668Calldata) {
      const [currency, kind] = defaultAbiCoder.decode(["address", "string"], query.eip3668Calldata);
      (query as any).currency = currency.toLowerCase();
      (query as any).kind = kind;
    }

    try {
      const eventsTableName = query.useNonFlaggedFloorAsk
        ? "collection_non_flagged_floor_sell_events"
        : "collection_floor_sell_events";

      const spotQuery = `
        SELECT
          events.price
        FROM ${eventsTableName} events
        WHERE events.collection_id = $/collection/
        ORDER BY events.created_at DESC
        LIMIT 1
      `;

      const twapQuery = `
        WITH
          x AS (
            SELECT
              *
            FROM ${eventsTableName} events
            WHERE events.collection_id = $/collection/
              AND events.created_at >= now() - interval '${query.twapSeconds} seconds'
            ORDER BY events.created_at
          ),
          y AS (
            SELECT
              *
            FROM ${eventsTableName} events
            WHERE events.collection_id = $/collection/
              AND events.created_at < (SELECT COALESCE(MIN(x.created_at), 'Infinity') FROM x)
            ORDER BY events.created_at DESC
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
          throw Boom.badRequest("No floor ask price available");
        }

        kind = PriceKind.SPOT;
        price = result.price;
      } else if (query.kind === "twap") {
        const result = await redb.oneOrNone(twapQuery, query);
        if (!result?.price) {
          throw Boom.badRequest("No floor ask price available");
        }

        kind = PriceKind.TWAP;
        price = result.price;
      } else {
        const spotResult = await redb.oneOrNone(spotQuery, query);
        const twapResult = await redb.oneOrNone(twapQuery, query);
        if (!spotResult?.price || !twapResult?.price) {
          throw Boom.badRequest("No floor ask price available");
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
        ContractWideCollectionPrice: {
          ContractWideCollectionPrice: [
            { name: "kind", type: "uint8" },
            { name: "twapSeconds", type: "uint256" },
            { name: "contract", type: "address" },
          ],
        },
        TokenRangeCollectionPrice: {
          TokenRangeCollectionPrice: [
            { name: "kind", type: "uint8" },
            { name: "twapSeconds", type: "uint256" },
            { name: "startTokenId", type: "uint256" },
            { name: "endTokenId", type: "uint256" },
          ],
        },
        CollectionPriceByToken: {
          CollectionPriceByToken: [
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
          "CollectionPriceByToken",
          EIP712_TYPES.CollectionPriceByToken,
          {
            kind,
            twapSeconds: kind === PriceKind.SPOT ? 0 : query.twapSeconds,
            token,
            tokenId,
          }
        );
      } else if (query.collection.includes(":")) {
        const [contract, startTokenId, endTokenId] = query.collection.split(":");
        id = _TypedDataEncoder.hashStruct(
          "TokenRangeCollectionPrice",
          EIP712_TYPES.TokenRangeCollectionPrice,
          {
            kind,
            twapSeconds: kind === PriceKind.SPOT ? 0 : query.twapSeconds,
            contract,
            startTokenId,
            endTokenId,
          }
        );
      } else {
        id = _TypedDataEncoder.hashStruct(
          "ContractWideCollectionPrice",
          EIP712_TYPES.ContractWideCollectionPrice,
          {
            kind,
            twapSeconds: kind === PriceKind.SPOT ? 0 : query.twapSeconds,
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
        message.signature = await addressToSigner[Signers.V1]().signMessage(
          arrayify(_TypedDataEncoder.hashStruct("Message", EIP712_TYPES.Message, message))
        );
      } else {
        throw Boom.badRequest("Instance cannot act as oracle");
      }

      return {
        price: formatPrice(price, decimals),
        message,
        // For EIP-3668 compatibility
        data: defaultAbiCoder.encode(
          ["(bytes32 id, bytes payload, uint256 timestamp, bytes signature)"],
          [message]
        ),
      };
    } catch (error) {
      if (!(error instanceof Boom.Boom)) {
        logger.error(
          `get-collection-floor-ask-oracle-${version}-handler`,
          `Handler failure: ${error}`
        );
      }
      throw error;
    }
  },
};
