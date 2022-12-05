/* eslint-disable @typescript-eslint/no-explicit-any */

import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";
import _ from "lodash";

import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { config } from "@/config/index";

import { Collections } from "@/models/collections";
import { generateMerkleTree } from "@reservoir0x/sdk/dist/common/helpers/merkle";
import * as tokenSet from "@/orderbook/token-sets";
import { generateSchemaHash } from "@/orderbook/orders/utils";
import { TokenSet } from "@/orderbook/token-sets/token-list";
import { redb } from "@/common/db";

const QUEUE_NAME = "flag-status-generate-collection-token-set";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 10,
    removeOnComplete: 100,
    removeOnFail: 100,
  },
});
new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const { contract, collectionId } = job.data;
      const collection = await Collections.getById(collectionId);

      if (!collection || collection.tokenCount > config.maxTokenSetSize) {
        return;
      }

      const tokens = await getCollectionTokens(collectionId);
      const flaggedTokens = tokens.filter((r) => r.isFlagged);

      if (flaggedTokens.length === 0) {
        logger.info(
          QUEUE_NAME,
          `No Flagged tokens. contract=${contract}, collectionId=${collectionId}`
        );

        if (collection.nonFlaggedTokenSetId) {
          logger.info(
            QUEUE_NAME,
            `Removed Non Flagged TokenSet from collection. contract=${contract}, collectionId=${collectionId}, tokenSetId=${collection.tokenSetId}, nonFlaggedTokenSetId=${collection.nonFlaggedTokenSetId}`
          );

          await Collections.update(collectionId, { nonFlaggedTokenSetId: null });
        }

        return;
      }

      const nonFlaggedTokensIds = tokens.filter((r) => !r.isFlagged).map((r) => r.tokenId);

      const merkleTree = generateMerkleTree(nonFlaggedTokensIds);
      const tokenSetId = `list:${contract}:${merkleTree.getHexRoot()}`;

      if (tokenSetId != collection.nonFlaggedTokenSetId) {
        const schema = {
          kind: "collection-non-flagged",
          data: {
            collection: collection.id,
          },
        };

        const schemaHash = generateSchemaHash(schema);

        // Create new token set for non flagged tokens
        const ts = await tokenSet.tokenList.save([
          {
            id: tokenSetId,
            schema,
            schemaHash,
            items: {
              contract,
              tokenIds: nonFlaggedTokensIds,
            },
          } as TokenSet,
        ]);

        if (ts.length !== 1) {
          logger.warn(
            QUEUE_NAME,
            `Invalid Token Set. contract=${contract}, collectionId=${collectionId}, generatedNonFlaggedTokenSetId=${tokenSetId}`
          );
        } else {
          logger.info(
            QUEUE_NAME,
            `Generated New Non Flagged TokenSet. contract=${contract}, collectionId=${collectionId}, tokenSetId=${collection.tokenSetId}, nonFlaggedTokenSetId=${collection.nonFlaggedTokenSetId}, generatedNonFlaggedTokenSetId=${tokenSetId}, flaggedTokenCount=${flaggedTokens.length}`
          );

          // Set the new non flagged tokens token set
          await Collections.update(collectionId, { nonFlaggedTokenSetId: tokenSetId });
        }
      } else {
        logger.info(
          QUEUE_NAME,
          `Non Flagged TokenSet Already Exists. contract=${contract}, collectionId=${collectionId}, tokenSetId=${collection.tokenSetId}, nonFlaggedTokenSetId=${collection.nonFlaggedTokenSetId}, generatedNonFlaggedTokenSetId=${tokenSetId}`
        );
      }
    },
    { connection: redis.duplicate(), concurrency: 1 }
  );

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

const getCollectionTokens = async (collectionId: string) => {
  const limit = 5000;
  let checkForMore = true;
  let continuation = "";

  let tokens: { tokenId: string; isFlagged: number }[] = [];

  while (checkForMore) {
    const query = `
        SELECT token_id, is_flagged
        FROM tokens
        WHERE collection_id = $/collectionId/
        ${continuation}
        ORDER BY token_id ASC
        LIMIT ${limit}
      `;

    const result = await redb.manyOrNone(query, {
      collectionId,
    });

    if (!_.isEmpty(result)) {
      tokens = _.concat(
        tokens,
        _.map(result, (r) => ({
          tokenId: r.token_id,
          isFlagged: r.is_flagged,
        }))
      );
      continuation = `AND token_id > ${_.last(result).token_id}`;
    }

    if (limit > _.size(result)) {
      checkForMore = false;
    }
  }

  return tokens;
};

export const addToQueue = async (contract: string, collectionId: string) => {
  await queue.add(randomUUID(), { contract, collectionId });
};
