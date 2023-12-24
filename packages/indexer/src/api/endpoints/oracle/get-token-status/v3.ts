import { defaultAbiCoder } from "@ethersproject/abi";
import { arrayify } from "@ethersproject/bytes";
import { _TypedDataEncoder } from "@ethersproject/hash";
import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { idb, pgp } from "@/common/db";
import { logger } from "@/common/logger";
import { Signers, addressToSigner } from "@/common/signers";
import { fromBuffer, regex, safeOracleTimestamp, toBuffer } from "@/common/utils";
import { config } from "@/config/index";

const version = "v3";

export const getTokenStatusOracleV3Options: RouteOptions = {
  description: "Token status oracle",
  notes:
    "Get a signed message of a token's details (flagged status and last transfer time). The oracle's address is 0xAeB1D03929bF87F69888f381e73FBf75753d75AF. The address is the same for all chains.",
  tags: ["api", "Oracle"],
  plugins: {
    "hapi-swagger": {
      order: 12,
    },
  },
  validate: {
    query: Joi.object({
      tokens: Joi.alternatives(
        Joi.array().items(Joi.string().pattern(regex.token)).min(1),
        Joi.string().pattern(regex.token)
      ).required(),
      signer: Joi.string().valid(Signers.V1, Signers.V2).default(Signers.V2),
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
            chainId: Joi.string().required(),
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
      let tokens = query.tokens as string[];
      if (!Array.isArray(tokens)) {
        tokens = [tokens];
      }

      // Make sure each token is unique
      tokens = [...new Set(tokens).keys()];

      // Fetch details for all tokens
      const results = await idb.manyOrNone(
        `
          SELECT
            tokens.contract,
            tokens.token_id,
            (CASE
              WHEN tokens.is_flagged = 1 THEN true
              ELSE false
            END) AS is_flagged,
            coalesce(extract('epoch' from tokens.last_flag_update), 0) AS last_flag_update,
            coalesce(
              (
                SELECT
                  nft_transfer_events.timestamp
                FROM nft_transfer_events
                WHERE nft_transfer_events.address = tokens.contract
                  AND nft_transfer_events.token_id = tokens.token_id
                  AND nft_transfer_events.is_deleted = 0
                ORDER BY nft_transfer_events.timestamp DESC
                LIMIT 1
              ),
              0
            ) AS last_transfer_time
          FROM tokens
          WHERE (tokens.contract, tokens.token_id) IN (${pgp.helpers.values(
            tokens.map((t) => ({
              contract: toBuffer(t.split(":")[0]),
              token_id: t.split(":")[1],
            })),
            ["contract", "token_id"]
          )})
        `
      );

      // Set default values for any tokens which don't exist
      const availableTokens = new Set<string>();
      results.forEach(({ contract, token_id }) =>
        availableTokens.add(`${fromBuffer(contract)}:${token_id}`)
      );
      for (const token of tokens) {
        if (!availableTokens.has(token)) {
          results.push({
            contract: toBuffer(token.split(":")[0]),
            token_id: token.split(":")[1],
            is_flagged: false,
            last_transfer_time: 0,
          });
        }
      }

      const timestamp = await safeOracleTimestamp();

      // Use EIP-712 structured hashing (https://eips.ethereum.org/EIPS/eip-712)
      const EIP712_TYPES = {
        Message: {
          Message: [
            { name: "id", type: "bytes32" },
            { name: "payload", type: "bytes" },
            { name: "timestamp", type: "uint256" },
            { name: "chainId", type: "uint256" },
          ],
        },
        Token: {
          Token: [
            { name: "contract", type: "address" },
            { name: "tokenId", type: "uint256" },
          ],
        },
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const messages: any[] = [];
      await Promise.all(
        results.map(async (result) => {
          const token = `${fromBuffer(result.contract)}:${result.token_id}`;

          const id = _TypedDataEncoder.hashStruct("Token", EIP712_TYPES.Token, {
            contract: fromBuffer(result.contract),
            tokenId: result.token_id,
          });

          const isFlagged = result.is_flagged;

          const message: {
            id: string;
            payload: string;
            timestamp: number;
            chainId: string;
            signature?: string;
          } = {
            id,
            payload: defaultAbiCoder.encode(
              ["bool", "uint256"],
              [isFlagged, result.last_transfer_time]
            ),
            timestamp,
            chainId: String(config.chainId),
          };

          message.signature = await addressToSigner[query.signer]().signMessage(
            arrayify(_TypedDataEncoder.hashStruct("Message", EIP712_TYPES.Message, message))
          );

          messages.push({
            token,
            isFlagged,
            lastTransferTime: result.last_transfer_time,
            message,
          });
        })
      );

      return { messages };
    } catch (error) {
      if (!(error instanceof Boom.Boom)) {
        logger.error(`get-token-status-oracle-${version}-handler`, `Handler failure: ${error}`);
      }
      throw error;
    }
  },
};
