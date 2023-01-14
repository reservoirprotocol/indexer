import { defaultAbiCoder } from "@ethersproject/abi";
import { arrayify } from "@ethersproject/bytes";
import { _TypedDataEncoder } from "@ethersproject/hash";
import { Wallet } from "@ethersproject/wallet";
import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { edb } from "@/common/db";
import { logger } from "@/common/logger";
import { now, regex, toBuffer } from "@/common/utils";
import { config } from "@/config/index";

const version = "v1";

export const getTokenStatusOracleV1Options: RouteOptions = {
  description: "Token status oracle",
  notes: "Get a signed message of a token's details (flagged status and last transfer time)",
  tags: ["api", "Oracle"],
  plugins: {
    "hapi-swagger": {
      order: 12,
    },
  },
  validate: {
    query: Joi.object({
      tokens: Joi.alternatives(
        Joi.array().items(Joi.string().pattern(regex.token)),
        Joi.string().pattern(regex.token)
      ).required(),
    }),
  },
  response: {
    schema: Joi.object({
      messages: Joi.array().items(
        Joi.object({
          token: Joi.string().pattern(regex.token).required(),
          isFlagged: Joi.boolean().required(),
          lastTransferTime: Joi.number().required(),
          message: Joi.object({
            id: Joi.string().required(),
            payload: Joi.string().required(),
            timestamp: Joi.number().required(),
            signature: Joi.string().required(),
          }),
        })
      ),
    }).label(`getTokenStatusOracle${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(`get-token-status-oracle-${version}-handler`, `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const query = request.query as any;

    if (!config.oraclePrivateKey) {
      throw Boom.badRequest("Instance cannot act as oracle");
    }

    try {
      let tokens = query.tokens;
      if (!Array.isArray(tokens)) {
        tokens = [tokens];
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const messages: any[] = [];
      for (const token of tokens) {
        const [contract, tokenId] = token.split(":");

        const result = await edb.oneOrNone(
          `
            SELECT
              (
                CASE
                  WHEN tokens.is_flagged = 1 THEN true
                  ELSE false
                END
              ) AS is_flagged,
              (
                SELECT
                  nft_transfer_events.timestamp
                FROM nft_transfer_events
                WHERE nft_transfer_events.address = tokens.contract
                  AND nft_transfer_events.token_id = tokens.token_id
                ORDER BY nft_transfer_events.timestamp DESC
                LIMIT 1
              ) AS last_transfer_time
            FROM tokens
            WHERE tokens.contract = $/contract/
              AND tokens.token_id = $/tokenId/
          `,
          {
            contract: toBuffer(contract),
            tokenId,
          }
        );
        if (!result) {
          throw Boom.badRequest("Unknown token");
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
          Token: {
            Token: [
              { name: "contract", type: "address" },
              { name: "tokenId", type: "uint256" },
            ],
          },
        };

        const id = _TypedDataEncoder.hashStruct("Token", EIP712_TYPES.Token, {
          contract,
          tokenId,
        });

        const message: {
          id: string;
          payload: string;
          timestamp: number;
          signature?: string;
        } = {
          id,
          payload: defaultAbiCoder.encode(
            ["bool", "uint256"],
            [result.is_flagged, result.last_transfer_time]
          ),
          timestamp: now(),
        };

        message.signature = await new Wallet(config.oraclePrivateKey).signMessage(
          arrayify(_TypedDataEncoder.hashStruct("Message", EIP712_TYPES.Message, message))
        );

        messages.push({
          token,
          isFlagged: result.is_flagged,
          lastTransferTime: result.last_transfer_time,
          message,
        });
      }

      return { messages };
    } catch (error) {
      logger.error(`get-token-status-oracle-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
