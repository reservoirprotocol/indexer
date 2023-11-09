import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { CollectionsEntity } from "@/models/collections/collections-entity";
import { add, getUnixTime, set, sub } from "date-fns";
import { Collections } from "@/models/collections";
import _ from "lodash";
import {
  CollectionMetadataInfo,
  collectionMetadataQueueJob,
} from "@/jobs/collection-updates/collection-metadata-queue-job";
import { redb } from "@/common/db";
import { fromBuffer } from "@/common/utils";

export default class CollectionRefreshJob extends AbstractRabbitMqJobHandler {
  queueName = "collections-refresh-queue";
  maxRetries = 10;
  concurrency = 1;
  useSharedChannel = true;
  timeout = 120000;

  public async process() {
    let collections: CollectionsEntity[] = [];

    // Get all collections minted 24 hours ago
    const yesterday = sub(new Date(), {
      days: 1,
    });

    const yesterdayStart = getUnixTime(set(yesterday, { hours: 0, minutes: 0, seconds: 0 }));
    const yesterdayEnd = getUnixTime(set(new Date(), { hours: 0, minutes: 0, seconds: 0 }));
    collections = collections.concat(
      await Collections.getCollectionsMintedBetween(yesterdayStart, yesterdayEnd)
    );

    // Get all collections minted 7 days ago
    const oneWeekAgo = sub(new Date(), {
      days: 7,
    });

    const oneWeekAgoStart = getUnixTime(set(oneWeekAgo, { hours: 0, minutes: 0, seconds: 0 }));
    const oneWeekAgoEnd = getUnixTime(
      set(add(oneWeekAgo, { days: 1 }), { hours: 0, minutes: 0, seconds: 0 })
    );

    collections = collections.concat(
      await Collections.getCollectionsMintedBetween(oneWeekAgoStart, oneWeekAgoEnd)
    );

    // Get top collections by volume
    collections = collections.concat(await Collections.getTopCollectionsByVolume());

    const collectionIds = _.map(collections, (collection) => collection.id);

    const results = await redb.manyOrNone(
      `
                SELECT
                  collections.contract,
                  collections.community,
                  t.token_id
                FROM collections
                JOIN LATERAL (
                    SELECT t.token_id
                    FROM tokens t
                    WHERE t.collection_id = collections.id
                    LIMIT 1
                ) t ON TRUE
                WHERE collections.id IN ($/collectionIds:list/)
              `,
      { collectionIds }
    );

    const infos = _.map(
      results,
      (result) =>
        ({
          contract: fromBuffer(result.contract),
          community: result.community,
          tokenId: result.token_id,
        } as CollectionMetadataInfo)
    );

    await collectionMetadataQueueJob.addToQueueBulk(infos);
  }

  public async addToQueue() {
    await this.send();
  }
}

export const collectionRefreshJob = new CollectionRefreshJob();
