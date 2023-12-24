/* eslint-disable @typescript-eslint/no-explicit-any */

import _ from "lodash";
import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";

import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { config } from "@/config/index";
import { PendingRefreshTokens, RefreshTokens } from "@/models/pending-refresh-tokens";
import { ridb } from "@/common/db";
import { fromBuffer } from "@/common/utils";
import { PendingRefreshTokensBySlug } from "@/models/pending-refresh-tokens-by-slug";
import { Tokens } from "@/models/tokens";
import { collectionMetadataQueueJob } from "@/jobs/collection-updates/collection-metadata-queue-job";
import { metadataIndexFetchJob } from "@/jobs/metadata-index/metadata-fetch-job";
import { metadataIndexProcessJob } from "@/jobs/metadata-index/metadata-process-job";
import { onchainMetadataFetchTokenUriJob } from "@/jobs/metadata-index/onchain-metadata-fetch-token-uri-job";

const QUEUE_NAME = "backfill-update-missing-metadata-queue";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: "exponential",
      delay: 1000,
    },
    removeOnComplete: 1000,
    removeOnFail: 10000,
    timeout: 60000,
  },
});
new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const limit = (await redis.get(`${QUEUE_NAME}-collections-limit`)) || 1;
      const { lastCollectionId } = job.data;

      // eslint-disable-next-line no-constant-condition
      let idFilter = "";
      if (lastCollectionId != "") {
        logger.info(QUEUE_NAME, `Last collection ID = ${lastCollectionId}`);
        idFilter = `WHERE id > '${lastCollectionId}'`;
      }

      const query = `
          SELECT id, contract, community, slug, token_count
          FROM collections
          ${idFilter}
          ORDER BY id ASC
          LIMIT ${limit}
        `;

      const collections = await ridb.manyOrNone(query);
      await Promise.all(
        _.map(collections, (collection) => {
          return processCollection({
            contract: fromBuffer(collection.contract),
            id: collection.id,
            community: collection.community,
            slug: collection.slug,
            tokenCount: collection.token_count,
          });
        })
      );

      // push queue messages
      await metadataIndexProcessJob.addToQueue({ method: "opensea" });

      if (_.size(collections) === limit) {
        const lastId = _.last(collections).id;
        await addToQueue(lastId);
      }
    },
    { connection: redis.duplicate(), concurrency: 1 }
  );

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });

  // if ([1, 5].includes(config.chainId)) {
  //   redlock
  //     .acquire([`${QUEUE_NAME}-lock`], 60 * 60 * 24 * 30 * 1000)
  //     .then(async () => {
  //       await addToQueue("");
  //     })
  //     .catch(() => {
  //       // Skip on any errors
  //     });
  // }
}

async function processCollectionTokens(
  collection: { contract: string; id: string; community: string; slug: string; tokenCount: number },
  limit: number,
  indexingMethod: string
) {
  const unindexedTokens: RefreshTokens[] = [];
  let lastTokenId = "";
  // eslint-disable-next-line no-constant-condition
  while (true) {
    let collectionAndTokenIdFilter = `WHERE (t.image is null or t.image = '') AND collection_id = '${collection.id}'`;
    if (lastTokenId != "") {
      logger.info(QUEUE_NAME, `Collection ID ${collection.id}, lastTokenId = ${lastTokenId}`);
      collectionAndTokenIdFilter = `WHERE (t.image is null or t.image = '') AND collection_id = '${collection.id}' AND t.token_id > '${lastTokenId}'`;
    }

    const query = `
      SELECT token_id
      FROM tokens t ${collectionAndTokenIdFilter}
      ORDER BY t.token_id ASC
      LIMIT ${limit}
    `;

    const tokens = await ridb.manyOrNone(query);
    _.forEach(tokens, (token) => {
      unindexedTokens.push({
        collection: collection.id,
        contract: collection.contract,
        tokenId: token.token_id,
      } as RefreshTokens);
    });

    if (_.size(tokens) < limit) {
      break;
    } else {
      lastTokenId = _.last(tokens).token_id;
    }
  }

  if (unindexedTokens.length === 0) {
    return;
  }

  // push to tokens refresh queue
  const pendingRefreshTokens = new PendingRefreshTokens(indexingMethod);
  await pendingRefreshTokens.add(unindexedTokens);

  if (indexingMethod === "onchain") {
    await onchainMetadataFetchTokenUriJob.addToQueue();
  } else {
    await metadataIndexProcessJob.addToQueue({ method: indexingMethod });
  }
}

async function processCollection(collection: {
  contract: string;
  id: string;
  community: string;
  slug: string;
  tokenCount: number;
}) {
  if (collection.tokenCount === 0) {
    logger.info(QUEUE_NAME, `Collection ${collection.id} is empty. Skipping processing.`);
    return;
  }
  // Disable large collections refresh
  if (collection.tokenCount > 30000) {
    logger.info(
      QUEUE_NAME,
      `Collection ${collection.id} contains ${collection.tokenCount} tokens. Skipping processing.`
    );
    return;
  }
  const indexingMethod = metadataIndexFetchJob.getIndexingMethod(collection.community);
  const limit = Number(await redis.get(`${QUEUE_NAME}-tokens-limit`)) || 1000;
  if (!collection.slug) {
    const tokenId = await Tokens.getSingleToken(collection.id);
    await collectionMetadataQueueJob.addToQueue({
      contract: collection.contract,
      tokenId,
      community: "opensea",
      forceRefresh: false,
    });
    await processCollectionTokens(collection, limit, indexingMethod);
    return;
  }
  const missingMetadataPercentageThreshold =
    (await redis.get(`${QUEUE_NAME}-percentage-threshold`)) || 0.5;

  const unindexedCountQuery = `
      SELECT count(*) as unindexed_token_count
      FROM tokens t
      WHERE (t.image is null or t.image = '') AND t.collection_id = '${collection.id}'
    `;

  const unindexedResult = await ridb.one(unindexedCountQuery);
  logger.info(
    QUEUE_NAME,
    `Processing collection with ID: ${collection.id}. Total tokens count: ${collection.tokenCount}, unindexed count: ${unindexedResult.unindexed_token_count}`
  );

  if (unindexedResult.unindexed_token_count === 0) {
    return;
  }
  if (
    unindexedResult.unindexed_token_count / collection.tokenCount >
    missingMetadataPercentageThreshold
  ) {
    // push to collection refresh queue
    const pendingRefreshTokensBySlug = new PendingRefreshTokensBySlug();
    await pendingRefreshTokensBySlug.add({
      slug: collection.slug,
      contract: collection.contract,
      collection: collection.id,
    });
  } else {
    await processCollectionTokens(collection, limit, indexingMethod);
  }
}

export const addToQueue = async (lastCollectionId: string, delay = 0) => {
  await queue.add(randomUUID(), { lastCollectionId }, { delay });
};
