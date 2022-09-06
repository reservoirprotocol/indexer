/* eslint-disable @typescript-eslint/no-explicit-any */

import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";
import _ from "lodash";

import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { config } from "@/config/index";

import { Tokens } from "@/models/tokens";
import { Collections } from "@/models/collections";
import { generateMerkleTree } from "@reservoir0x/sdk/dist/common/helpers/merkle";
import * as tokenSet from "@/orderbook/token-sets";
import { generateSchemaHash } from "@/orderbook/orders/utils";
import { TokenSet } from "@/orderbook/token-sets/token-list";

const QUEUE_NAME = "non-flagged-token-set";

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

      const tokenIds = await Tokens.getTokenIdsInCollection(collectionId, contract, true);
      if (_.isEmpty(tokenIds)) {
        logger.warn(QUEUE_NAME, `No tokens for contract=${contract}, collectionId=${collectionId}`);
      }

      const merkleTree = generateMerkleTree(tokenIds);
      const tokenSetId = `list:${contract}:${merkleTree.getHexRoot()}`;
      const schema = {
        kind: "collection-non-flagged",
        data: {
          collection: collection.id,
        },
      };

      // Create new token set for non flagged tokens
      const ts = await tokenSet.tokenList.save([
        {
          id: tokenSetId,
          schema,
          schemaHash: generateSchemaHash(schema),
          items: {
            contract,
            tokenIds,
          },
        } as TokenSet,
      ]);

      if (ts.length !== 1) {
        logger.warn(
          QUEUE_NAME,
          `No tokens for contract=${contract}, collectionId=${collectionId}, tokenSetId=${tokenSetId}`
        );
      } else {
        logger.info(
          QUEUE_NAME,
          `Non Flagged Token set generated for contract=${contract}, collectionId=${collectionId}, tokenSetId=${collection.tokenSetId}, nonFlaggedTokenSetId=${collection.nonFlaggedTokenSetId}, generatedMonFlaggedTokenSetId=${tokenSetId}`
        );

        // Set the new non flagged tokens token set
        await Collections.update(collectionId, { nonFlaggedTokenSetId: tokenSetId });
      }
    },
    { connection: redis.duplicate(), concurrency: 1 }
  );

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export const addToQueue = async (contract: string, collectionId: string) => {
  await queue.add(randomUUID(), { contract, collectionId });
};
