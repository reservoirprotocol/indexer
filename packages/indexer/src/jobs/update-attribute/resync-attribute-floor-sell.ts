import _ from "lodash";
import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";

import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { config } from "@/config/index";

import { redb } from "@/common/db";
import { fromBuffer } from "@/common/utils";
import { resyncAttributeCacheJob } from "@/jobs/update-attribute/resync-attribute-cache-job";

const QUEUE_NAME = "resync-attribute-floor-value-queue";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 10,
    removeOnComplete: 1000,
    removeOnFail: 10000,
  },
});
new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const { continuation } = job.data;
      const limit = 500;
      let continuationFilter = "";

      if (continuation != "") {
        continuationFilter = `WHERE id > '${continuation}'`;
      }

      const query = `SELECT id
                     FROM collections
                     ${continuationFilter}
                     ORDER BY id ASC
                     LIMIT ${limit}`;

      const collections = await redb.manyOrNone(query);

      if (collections) {
        const collectionsIds = _.join(
          _.map(collections, (collection) => collection.id),
          "','"
        );

        const tokensQuery = `
            SELECT DISTINCT ON (key, value) key, value, tokens.contract, tokens.token_id
            FROM collections
            JOIN tokens ON collections.contract = tokens.contract
            JOIN token_attributes ON tokens.contract = token_attributes.contract AND token_attributes.token_id = tokens.token_id
            WHERE collections.id IN ('$/collectionsIds:raw/')
            AND tokens.floor_sell_value IS NOT NULL
        `;

        const tokens = await redb.manyOrNone(tokensQuery, { collectionsIds });

        _.forEach(tokens, (token) => {
          resyncAttributeCacheJob.addToQueue(
            { contract: fromBuffer(token.contract), tokenId: token.token_id },
            0
          );
        });

        job.data.cursor = null;
        if (_.size(collections) == limit) {
          const lastCollection = _.last(collections);
          job.data.cursor = lastCollection.id;
        }
      }
    },
    { connection: redis.duplicate(), concurrency: 3 }
  );

  worker.on("completed", async (job) => {
    if (job.data.cursor) {
      logger.info(QUEUE_NAME, `Updated up to lastCollection=${job.data.cursor}`);
      await addToQueue(job.data.cursor);
    }
  });

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export const addToQueue = async (continuation = "") => {
  await queue.add(randomUUID(), { continuation });
};
