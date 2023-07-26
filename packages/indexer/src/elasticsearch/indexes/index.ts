/* eslint-disable no-console */

import * as activitiesIndex from "@/elasticsearch/indexes/activities";
import { logger } from "@/common/logger";
import { acquireLock } from "@/common/redis";

export const initIndexes = async (): Promise<void> => {
  const start = new Date().getTime();

  console.log("initIndexes - start");

  const acquiredLock = await acquireLock("elasticsearchInitIndexes", 60);

  if (acquiredLock) {
    await Promise.all([activitiesIndex.initIndex()]);

    console.log("initIndexes - done", new Date().getTime() - start);

    logger.info("elasticsearch", `Initialized Indices!`);
  } else {
    console.log("initIndexes - skip", new Date().getTime() - start);

    logger.info("elasticsearch", `Skip Initialized Indices!`);
  }
};
