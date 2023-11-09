import * as activitiesIndex from "@/elasticsearch/indexes/activities";
import * as asksIndex from "@/elasticsearch/indexes/asks";
import * as collectionsIndex from "@/elasticsearch/indexes/collections";

import { logger } from "@/common/logger";
import { acquireLock } from "@/common/redis";

export const initIndexes = async (): Promise<void> => {
  const acquiredLock = await acquireLock("elasticsearchInitIndexes", 60);

  if (acquiredLock) {
    await Promise.all([
      activitiesIndex.initIndex(),
      asksIndex.initIndex(),
      collectionsIndex.initIndex(),
    ]);

    logger.info("elasticsearch", `Initialized Indices!`);
  } else {
    logger.info("elasticsearch", `Skip Initialized Indices!`);
  }
};
