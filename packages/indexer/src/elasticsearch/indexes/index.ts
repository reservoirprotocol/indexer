import * as activitiesIndex from "@/elasticsearch/indexes/activities";
import * as asksIndex from "@/elasticsearch/indexes/asks";
import * as collectionsIndex from "@/elasticsearch/indexes/collections";

export const initIndexes = async (): Promise<void> => {
  await Promise.all([
    activitiesIndex.initIndex(),
    asksIndex.initIndex(),
    collectionsIndex.initIndex(),
  ]);
};
