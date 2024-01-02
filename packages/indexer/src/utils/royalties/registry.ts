import { Interface } from "@ethersproject/abi";
import { Contract } from "@ethersproject/contracts";
import * as Sdk from "@reservoir0x/sdk";
import stringify from "json-stable-stringify";
import _ from "lodash";

import { idb } from "@/common/db";
import { logger } from "@/common/logger";
import { baseProvider } from "@/common/provider";
import { redis } from "@/common/redis";
import { bn, fromBuffer } from "@/common/utils";
import { config } from "@/config/index";
import { Royalty, updateRoyaltySpec } from "@/utils/royalties";

// The royalties are returned in full amounts, but we store them as a percentage
// so here we just use a default price (which is a round number) and deduce then
// deduce the percentage taken as royalties from that
const DEFAULT_PRICE = "1000000000000000000";

// Assume there are no per-token royalties but everything is per-contract
export const refreshRegistryRoyalties = async (collection: string) => {
  try {
    if (collection === "0x27ca1486749ef528b97a7ea1857f0b6aaee2626a") {
      logger.info(
        "refreshRegistryRoyalties",
        JSON.stringify({
          topic: "debugRefreshRoyalties",
          message: `Start. collection=${collection}`,
        })
      );
    }

    // Fetch the collection's contract
    const collectionResult = await idb.oneOrNone(
      `
        SELECT
          collections.contract
        FROM collections
        WHERE collections.id = $/collection/
      `,
      { collection }
    );
    if (!collectionResult?.contract) {
      return;
    }

    // Fetch 10 random tokens from the collection
    const tokenResults = await idb.manyOrNone(
      `
        SELECT
          tokens.token_id
        FROM tokens
        WHERE tokens.collection_id = $/collection/
        LIMIT 10
      `,
      { collection }
    );

    const token = fromBuffer(collectionResult.contract);

    // Get the royalties of all selected tokens
    const tokenRoyalties = await Promise.all(
      tokenResults.map(async (r) => getRegistryRoyalties(token, r.token_id))
    );
    const uniqueRoyalties = _.uniqBy(tokenRoyalties, (r) => stringify(r));

    let latestRoyalties: Royalty[] = [];
    if (uniqueRoyalties.length === 1) {
      // Here all royalties are the same, so we take that as the collection-level royalty
      latestRoyalties = uniqueRoyalties[0];
    } else {
      // Here we got non-unique royalties

      // However, before assuming there are no collection-level royalties we query one
      // more random (hopefully inexistent token id). If that returns a value found in
      // the `uniqueRoyalties` array then we assume that is the collection-level value
      // and the non-unique royalties were just one-offs (eg. just a few single tokens
      // had the royalties changed), which we want to filter out.

      try {
        const randomTokenId = String(Math.floor(Math.random() * 10000000000000));
        const randomTokenRoyalties = await getRegistryRoyalties(token, randomTokenId);
        if (uniqueRoyalties.find((r) => stringify(r) === stringify(randomTokenRoyalties))) {
          latestRoyalties = randomTokenRoyalties;
        } else {
          latestRoyalties = [];
        }
      } catch {
        // Protect against the case where querying the royalties of a non-existent token reverts
        latestRoyalties = [];
      }
    }

    if (collection === "0x27ca1486749ef528b97a7ea1857f0b6aaee2626a") {
      logger.info(
        "refreshRegistryRoyalties",
        JSON.stringify({
          topic: "debugRefreshRoyalties",
          message: `getRegistryRoyalties. collection=${collection}`,
          latestRoyalties,
        })
      );
    }

    // Save the retrieved royalty spec
    await updateRoyaltySpec(
      collection,
      "onchain",
      latestRoyalties.length ? latestRoyalties : undefined
    );
  } catch {
    // Skip errors
  }
};

const internalGetRegistryRoyalties = async (token: string, tokenId: string) => {
  const latestRoyalties: Royalty[] = [];

  if (Sdk.Common.Addresses.RoyaltyEngine[config.chainId]) {
    // When configured / available, use the royalty engine

    const royaltyEngine = new Contract(
      Sdk.Common.Addresses.RoyaltyEngine[config.chainId],
      new Interface([
        `
          function getRoyaltyView(
            address token,
            uint256 tokenId,
            uint256 value
          ) external view returns (
            address[] recipients,
            uint256[] amounts
          )
        `,
      ]),
      baseProvider
    );

    try {
      const { recipients, amounts } = await royaltyEngine
        .getRoyaltyView(token, tokenId, DEFAULT_PRICE)
        .catch(() => ({ recipients: [], amounts: [] }));

      for (let i = 0; i < amounts.length; i++) {
        const recipient = recipients[i].toLowerCase();
        const amount = amounts[i];
        if (bn(amount).gte(DEFAULT_PRICE)) {
          throw new Error("Royalty exceeds price");
        }

        const bps = Math.round(bn(amount).mul(10000).div(DEFAULT_PRICE).toNumber());
        latestRoyalties.push({ recipient, bps });
      }
    } catch (error) {
      logger.error(
        "getRegistryRoyalties",
        JSON.stringify({
          topic: "debugRoyalties",
          message: `Error. token=${token}, tokenId=${tokenId}, error=${error}`,
        })
      );
    }
  } else {
    // Otherwise, use EIP-2981 on-chain royalty information

    const contract = new Contract(
      token,
      new Interface([
        `
          function royaltyInfo(
            uint256 tokenId,
            uint256 value
          ) external view returns (
            address recipient,
            uint256 amount
          )
        `,
      ]),
      baseProvider
    );

    try {
      const result = await contract.royaltyInfo(tokenId, DEFAULT_PRICE);

      const recipient = result.recipient.toLowerCase();
      const amount = result.amount;
      if (bn(amount).gte(DEFAULT_PRICE)) {
        throw new Error("Royalty exceeds price");
      }

      const bps = Math.round(bn(amount).mul(10000).div(DEFAULT_PRICE).toNumber());
      latestRoyalties.push({ recipient, bps });
    } catch {
      // Skip errors
    }
  }

  return latestRoyalties;
};

export const getRegistryRoyalties = async (contract: string, tokenId: string) => {
  const cacheKey = `token-royalties:${contract}:${tokenId}`;

  let result = await redis
    .get(cacheKey)
    .then((r) => (r ? (JSON.parse(r) as Royalty[]) : undefined));

  if (!result) {
    result = await internalGetRegistryRoyalties(contract, tokenId);
    await redis.set(cacheKey, JSON.stringify(result), "EX", 5 * 60);
  }

  return result;
};
