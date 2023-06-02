import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { CollectionsEntity } from "@/models/collections/collections-entity";
import { add, getUnixTime, set, sub } from "date-fns";
import { Collections } from "@/models/collections";
import _ from "lodash";
import { metadataQueueJob } from "@/jobs/collection-updates/metadata-queue-job";

export class CollectionRefreshJob extends AbstractRabbitMqJobHandler {
  queueName = "collections-refresh-queue";
  maxRetries = 10;
  concurrency = 1;

  protected async process() {
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

    const contracts = _.map(collections, (collection) => ({
      contract: collection.contract,
      community: collection.community,
    }));

    await metadataQueueJob.addToQueue({ contract: contracts });
  }

  public async addToQueue() {
    await this.send();
  }
}

export const collectionRefreshJob = new CollectionRefreshJob();
