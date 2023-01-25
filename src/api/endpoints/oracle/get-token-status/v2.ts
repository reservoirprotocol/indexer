import { defaultAbiCoder } from "@ethersproject/abi";
import { arrayify } from "@ethersproject/bytes";
import { _TypedDataEncoder } from "@ethersproject/hash";
import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import axios from "axios";
import Joi from "joi";

import { edb, pgp } from "@/common/db";
import { logger } from "@/common/logger";
import { baseProvider } from "@/common/provider";
import { Signers, addressToSigner } from "@/common/signers";
import { fromBuffer, regex, toBuffer } from "@/common/utils";
import { config } from "@/config/index";

const version = "v2";

export const getTokenStatusOracleV2Options: RouteOptions = {
  description: "Token status oracle",
  notes:
    "Get a signed message of a token's details (flagged status and last transfer time). The oracle's address is 0xAeB1D03929bF87F69888f381e73FBf75753d75AF.",
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

      // Try making a synchronous request to OpenSea to get the most up-to-date flagged status
      const tokenToSuspicious = new Map<string, boolean>();
      const callOpensea = (async () => {
        if (tokens.length <= 30) {
          const searchParams = new URLSearchParams();
          tokens.forEach((t) => {
            const [contract, tokenId] = t.split(":");
            searchParams.append("asset_contract_addresses", contract);
            searchParams.append("token_ids", tokenId);
          });

          await axios
            .get(
              `https://${
                config.chainId === 5 ? "testnets-api" : "api"
              }.opensea.io/api/v1/assets?${searchParams.toString()}`,
              {
                headers: {
                  "Content-Type": "application/json",
                  "X-Api-Key": config.openSeaApiKey,
                },
              }
            )
            .then((response) => {
              for (const asset of response.data.assets) {
                const contract = asset.asset_contract.address;
                const tokenId = asset.token_id;

                tokenToSuspicious.set(
                  `${contract.toLowerCase()}:${tokenId}`,
                  !asset.supports_wyvern
                );
              }
            })
            .catch(() => {
              // Skip errors
            });
        }
      })();

      // Fetch details for all tokens
      const results = await edb.manyOrNone(
        `
          SELECT
            t.contract::BYTEA,
            t.token_id::NUMERIC(78, 0),
            COALESCE(
              (
                SELECT
                  CASE
                    WHEN tokens.is_flagged = 1 THEN true
                    ELSE false
                  END
                FROM tokens
                WHERE tokens.contract = t.contract::BYTEA
                  AND tokens.token_id = t.token_id::NUMERIC(78, 0)
              ),
              false
            ) AS is_flagged,
            COALESCE(
              (
                SELECT
                  nft_transfer_events.timestamp
                FROM nft_transfer_events
                WHERE nft_transfer_events.address = t.contract::BYTEA
                  AND nft_transfer_events.token_id = t.token_id::NUMERIC(78, 0)
                ORDER BY nft_transfer_events.timestamp DESC
                LIMIT 1
              ),
              0
            ) AS last_transfer_time
          FROM (
            VALUES ${pgp.helpers.values(
              tokens.map((t) => ({
                contract: toBuffer(t.split(":")[0]),
                token_id: t.split(":")[1],
              })),
              ["contract", "token_id"]
            )}
          ) t(contract, token_id)
        `
      );

      // Give at most 5 seconds to the OpenSea call to complete
      await Promise.race([callOpensea, new Promise((resolve) => setTimeout(resolve, 5000))]);

      // Use the timestamp of the latest available block as the message timestamp
      const timestamp = await baseProvider.getBlock("latest").then((b) => b.timestamp);

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

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const messages: any[] = [];
      await Promise.all(
        results.map(async (result) => {
          const token = `${fromBuffer(result.contract)}:${result.token_id}`;

          const id = _TypedDataEncoder.hashStruct("Token", EIP712_TYPES.Token, {
            contract: fromBuffer(result.contract),
            tokenId: result.token_id,
          });

          const isFlagged = tokenToSuspicious.has(token)
            ? tokenToSuspicious.get(token)
            : result.is_flagged;

          const message: {
            id: string;
            payload: string;
            timestamp: number;
            signature?: string;
          } = {
            id,
            payload: defaultAbiCoder.encode(
              ["bool", "uint256"],
              [isFlagged, result.last_transfer_time]
            ),
            timestamp,
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
      logger.error(`get-token-status-oracle-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
