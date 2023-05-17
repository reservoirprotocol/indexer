import * as activitiesIndex from "@/elasticsearch/indexes/activities";
import { logger } from "@/common/logger";

export const initIndexes = async (): Promise<void> => {
  await Promise.all([activitiesIndex.createIndex()]);

  logger.info("elasticsearch", `Initialized Indices!`);
};
