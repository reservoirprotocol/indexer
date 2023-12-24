import { config } from "@/config/index";
import cron from "node-cron";
import { redis, redlock } from "@/common/redis";
import { redb } from "@/common/db";
import { fromBuffer } from "@/common/utils";
import { logger } from "@/common/logger";
import { openseaOrdersProcessJob } from "@/jobs/opensea-orders/opensea-orders-process-job";

const getCollections = async () => {
  let collections = [];

  const collectionsJson = await redis.get(`refresh-opensea-collection-offers-collections`);

  if (collectionsJson) {
    collections = JSON.parse(collectionsJson);
  } else {
    const collectionsResult = await redb.manyOrNone(
      `SELECT id, contract, slug FROM collections WHERE day30_rank <= 1000 ORDER BY day30_rank LIMIT 1000`
    );

    collections = collectionsResult.map((collection) => ({
      contract: fromBuffer(collection.contract),
      id: collection.id,
      slug: collection.slug,
    }));

    await redis.set(
      `refresh-opensea-collection-offers-collections`,
      JSON.stringify(collections),
      "EX",
      3600
    );
  }

  return collections;
};

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork && config.metadataIndexingMethodCollection === "opensea") {
  cron.schedule(
    "*/30 * * * *",
    async () =>
      await redlock
        .acquire([`refresh-opensea-collection-offers-collections-cron-lock`], (30 * 60 - 5) * 1000)
        .then(async () => {
          getCollections()
            .then(async (collections) => {
              logger.info("refresh-opensea-collection-offers-collections", "Start");

              await openseaOrdersProcessJob.addToQueue(
                collections.map((collection: { contract: string; id: string; slug: string }) => ({
                  kind: "collection-offers",
                  data: {
                    contract: collection.contract,
                    collectionId: collection.id,
                    collectionSlug: collection.slug,
                  },
                }))
              );
            })
            .catch((error) => {
              logger.error(
                "refresh-opensea-collection-offers-collections",
                `Error getting collections. error=${error}`
              );
            });
        })
        .catch(() => {
          // Skip on any errors
        })
  );
}
