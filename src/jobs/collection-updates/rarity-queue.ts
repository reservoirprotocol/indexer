import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";

import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { config } from "@/config/index";
import { Rarity } from "@/utils/rarity";
import _ from "lodash";
import { idb } from "@/common/db";
import { Collections } from "@/models/collections";
import { toBuffer } from "@/common/utils";

const QUEUE_NAME = "rarity-queue";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 10,
    removeOnComplete: true,
    removeOnFail: 1000,
  },
});
new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const { collectionId } = job.data;
      const collection = await Collections.getById(collectionId, true);

      // If no collection found
      if (_.isNull(collection)) {
        logger.error(QUEUE_NAME, `Collection ${collectionId} not fund`);
        return;
      }

      // If the collection is too big
      if (collection.tokenCount > 30000) {
        logger.error(
          QUEUE_NAME,
          `Collection ${collectionId} has too many tokens (${collection.tokenCount})`
        );
        return;
      }

      const tokensRarity = await Rarity.getCollectionTokensRarity(collectionId);
      const tokensRarityChunks = _.chunk(tokensRarity, 500);

      // Update the tokens rarity
      for (const tokens of tokensRarityChunks) {
        let updateTokensString = "";
        const replacementParams = {
          contract: toBuffer(collection.contract),
        };

        _.forEach(tokens, (token) => {
          updateTokensString += `(${token.id}, ${token.rarityTraitSum}, ${token.rarityTraitSumRank}),`;
        });

        updateTokensString = _.trimEnd(updateTokensString, ",");

        if (updateTokensString !== "") {
          const updateQuery = `UPDATE tokens
                               SET rarity_score = x.rarityTraitSum, rarity_rank = x.rarityTraitSumRank
                               FROM (VALUES ${updateTokensString}) AS x(tokenId, rarityTraitSum, rarityTraitSumRank)
                               WHERE contract = $/contract/
                               AND token_id = x.tokenId`;

          await idb.none(updateQuery, replacementParams);
        }
      }
    },
    { connection: redis.duplicate(), concurrency: 1 }
  );

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export const addToQueue = async (collectionId: string | string[], delay = 60 * 60 * 1000) => {
  if (_.isArray(collectionId)) {
    await queue.addBulk(
      _.map(collectionId, (id) => ({
        name: randomUUID(),
        data: { collectionId: id },
        opts: { delay, jobId: id },
      }))
    );
  } else {
    await queue.add(randomUUID(), { collectionId }, { delay, jobId: collectionId });
  }
};
