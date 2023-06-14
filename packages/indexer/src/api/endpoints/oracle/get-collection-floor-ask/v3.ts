/* eslint-disable @typescript-eslint/no-explicit-any */

import { defaultAbiCoder } from "@ethersproject/abi";
import { arrayify } from "@ethersproject/bytes";
import { AddressZero } from "@ethersproject/constants";
import { _TypedDataEncoder } from "@ethersproject/hash";
import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import * as Sdk from "@reservoir0x/sdk";
import axios from "axios";
import Joi from "joi";

import { redb } from "@/common/db";
import { logger } from "@/common/logger";
import { Signers, addressToSigner } from "@/common/signers";
import { bn, formatPrice, safeOracleTimestamp } from "@/common/utils";
import { config } from "@/config/index";

const version = "v3";

export const getCollectionFloorAskOracleV3Options: RouteOptions = {
  description: "Collection floor",
  notes:
    "Get a signed message of any collection's floor price (spot or twap). The oracle's address is 0x32dA57E736E05f75aa4FaE2E9Be60FD904492726.",
  tags: ["api", "x-deprecated"],
  plugins: {
    "hapi-swagger": {
      order: 12,
    },
  },
  validate: {
    params: Joi.object({
      collection: Joi.string().lowercase().required(),
    }),
    query: Joi.object({
      kind: Joi.string().valid("spot", "twap", "lower", "upper").default("spot"),
      currency: Joi.string().lowercase().default(AddressZero),
      twapSeconds: Joi.number().default(24 * 60 * 60),
      eip3668Calldata: Joi.string(),
    }),
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
    const params = request.params as any;

    if (query.eip3668Calldata) {
      const [currency, kind] = defaultAbiCoder.decode(["address", "string"], query.eip3668Calldata);
      (query as any).currency = currency.toLowerCase();
      (query as any).kind = kind;
    }

    try {
      const spotQuery = `
        SELECT
          collection_floor_sell_events.price
        FROM collection_floor_sell_events
        WHERE collection_floor_sell_events.collection_id = $/collection/
        ORDER BY collection_floor_sell_events.created_at DESC
        LIMIT 1
      `;

      const twapQuery = `
        WITH
          x AS (
            SELECT
              *
            FROM collection_floor_sell_events
            WHERE collection_floor_sell_events.collection_id = $/collection/
              AND collection_floor_sell_events.created_at >= now() - interval '${query.twapSeconds} seconds'
            ORDER BY collection_floor_sell_events.created_at
          ),
          y AS (
            SELECT
              *
            FROM collection_floor_sell_events
            WHERE collection_floor_sell_events.collection_id = $/collection/
              AND collection_floor_sell_events.created_at < (SELECT COALESCE(MIN(x.created_at), 'Infinity') FROM x)
            ORDER BY collection_floor_sell_events.created_at DESC
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
        const result = await redb.oneOrNone(spotQuery, params);
        if (!result?.price) {
          throw Boom.badRequest("No floor ask price available");
        }

        kind = PriceKind.SPOT;
        price = result.price;
      } else if (query.kind === "twap") {
        const result = await redb.oneOrNone(twapQuery, params);
        if (!result?.price) {
          throw Boom.badRequest("No floor ask price available");
        }

        kind = PriceKind.TWAP;
        price = result.price;
      } else {
        const spotResult = await redb.oneOrNone(spotQuery, params);
        const twapResult = await redb.oneOrNone(twapQuery, params);
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
      };

      let id: string;
      if (params.collection.includes(":")) {
        const [contract, startTokenId, endTokenId] = params.collection.split(":");
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
            contract: params.collection,
          }
        );
      }

      if (Object.values(Sdk.Common.Addresses.Eth).includes(query.currency)) {
        // ETH: do nothing
      } else if (Object.values(Sdk.Common.Addresses.Weth).includes(query.currency)) {
        // WETH: do nothing
      } else if ([...Object.values(Sdk.Common.Addresses.Usdc)].includes(query.currency)) {
        // USDC: convert price to USDC
        const usdPrice = await axios
          .get("https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd")
          .then((response) => (response.data as any).ethereum.usd);

        // USDC has 6 decimals
        price = bn(Math.floor(usdPrice * 1000000))
          .mul(price)
          .div(bn("1000000000000000000"))
          .toString();
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
