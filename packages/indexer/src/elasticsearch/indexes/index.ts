import * as activitiesIndex from "@/elasticsearch/indexes/activities";
import { logger } from "@/common/logger";
import { acquireLock } from "@/common/redis";

export const initIndexes = async (): Promise<void> => {
  const acquiredLock = await acquireLock("elasticsearchInitIndexes", 60);

  if (acquiredLock) {
    await Promise.all([activitiesIndex.initIndex()]);

    logger.info("elasticsearch", `Initialized Indices!`);
  } else {
    logger.info("elasticsearch", `Skip Initialized Indices!`);
  }
};
