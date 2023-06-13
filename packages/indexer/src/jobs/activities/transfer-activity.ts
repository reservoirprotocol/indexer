import { ActivitiesEntityInsertParams, ActivityType } from "@/models/activities/activities-entity";
import { Tokens } from "@/models/tokens";
import _ from "lodash";
import { Activities } from "@/models/activities";
import { getActivityHash } from "@/jobs/activities/utils";
import { UserActivitiesEntityInsertParams } from "@/models/user-activities/user-activities-entity";
import { UserActivities } from "@/models/user-activities";
import { config } from "@/config/index";

import * as ActivitiesIndex from "@/elasticsearch/indexes/activities";
import { NftTransferEventCreatedEventHandler } from "@/elasticsearch/indexes/activities/event-handlers/nft-transfer-event-created";
import { getNetworkSettings } from "@/config/network";
import { logger } from "@/common/logger";
import { fixActivitiesMissingCollectionJob } from "@/jobs/activities/fix-activities-missing-collection-job";

export class TransferActivity {
  public static async handleEvent(data: NftTransferEventData) {
    const collectionId = await Tokens.getCollectionId(data.contract, data.tokenId);

    const activityHash = getActivityHash(
      data.transactionHash,
      data.logIndex.toString(),
      data.batchIndex.toString()
    );

    const mintAddresses = getNetworkSettings().mintAddresses;

    const activity = {
      type: mintAddresses.includes(data.fromAddress) ? ActivityType.mint : ActivityType.transfer,
      hash: activityHash,
      contract: data.contract,
      collectionId,
      tokenId: data.tokenId,
      fromAddress: data.fromAddress,
      toAddress: data.toAddress,
      price: 0,
      amount: data.amount,
      blockHash: data.blockHash,
      eventTimestamp: data.timestamp,
      metadata: {
        transactionHash: data.transactionHash,
        logIndex: data.logIndex,
        batchIndex: data.batchIndex,
      },
    } as ActivitiesEntityInsertParams;

    const userActivities: UserActivitiesEntityInsertParams[] = [];

    // One record for the user to address
    const toUserActivity = _.clone(activity) as UserActivitiesEntityInsertParams;
    toUserActivity.address = data.toAddress;
    userActivities.push(toUserActivity);

    if (!mintAddresses.includes(data.fromAddress)) {
      // One record for the user from address if not a mint event
      const fromUserActivity = _.clone(activity) as UserActivitiesEntityInsertParams;
      fromUserActivity.address = data.fromAddress;
      userActivities.push(fromUserActivity);
    }

    await Promise.all([
      Activities.addActivities([activity]),
      UserActivities.addActivities(userActivities),
    ]);

    if (config.doElasticsearchWork) {
      const eventHandler = new NftTransferEventCreatedEventHandler(
        data.transactionHash,
        data.logIndex,
        data.batchIndex
      );
      const esActivity = await eventHandler.generateActivity();

      if (esActivity) {
        await ActivitiesIndex.save([esActivity]);
      }
    }

    // If collection information is not available yet when a mint event
    if (!collectionId && activity.type === ActivityType.mint) {
      await fixActivitiesMissingCollectionJob.addToQueue({
        contract: data.contract,
        tokenId: data.tokenId,
      });
    }
  }

  public static async handleEvents(events: NftTransferEventData[]) {
    const collectionIds = await Tokens.getCollectionIds(
      _.map(events, (d) => ({ contract: d.contract, tokenId: d.tokenId }))
    );

    const activities = [];
    const userActivities = [];
    const esActivities = [];
    const mintAddresses = getNetworkSettings().mintAddresses;

    for (const data of events) {
      const activityHash = getActivityHash(
        data.transactionHash,
        data.logIndex.toString(),
        data.batchIndex.toString()
      );

      const collectionId = collectionIds?.get(`${data.contract}:${data.tokenId}`);

      const activity = {
        type: mintAddresses.includes(data.fromAddress) ? ActivityType.mint : ActivityType.transfer,
        hash: activityHash,
        contract: data.contract,
        collectionId,
        tokenId: data.tokenId,
        fromAddress: data.fromAddress,
        toAddress: data.toAddress,
        price: 0,
        amount: data.amount,
        blockHash: data.blockHash,
        eventTimestamp: data.timestamp,
        metadata: {
          transactionHash: data.transactionHash,
          logIndex: data.logIndex,
          batchIndex: data.batchIndex,
        },
      } as ActivitiesEntityInsertParams;

      // One record for the user to address
      const toUserActivity = _.clone(activity) as UserActivitiesEntityInsertParams;
      toUserActivity.address = data.toAddress;
      userActivities.push(toUserActivity);

      if (!mintAddresses.includes(data.fromAddress)) {
        // One record for the user from address if not a mint event
        const fromUserActivity = _.clone(activity) as UserActivitiesEntityInsertParams;
        fromUserActivity.address = data.fromAddress;
        userActivities.push(fromUserActivity);
      }

      activities.push(activity);

      if (config.doElasticsearchWork) {
        const eventHandler = new NftTransferEventCreatedEventHandler(
          data.transactionHash,
          data.logIndex,
          data.batchIndex
        );

        try {
          const esActivity = await eventHandler.generateActivity();

          if (esActivity) {
            esActivities.push(esActivity);
          }
        } catch (error) {
          logger.error(
            "generate-elastic-activity",
            `failed to generate elastic activity error ${error} activity ${JSON.stringify(
              activity
            )}`
          );
        }
      }

      // If collection information is not available yet when a mint event
      if (!collectionId && activity.type === ActivityType.mint) {
        await fixActivitiesMissingCollectionJob.addToQueue({
          contract: data.contract,
          tokenId: data.tokenId,
        });
      }
    }

    // Insert activities in batch
    await Promise.all([
      Activities.addActivities(activities),
      UserActivities.addActivities(userActivities),
    ]);

    if (esActivities.length) {
      await ActivitiesIndex.save(esActivities, false);
    }
  }
}

export type NftTransferEventData = {
  contract: string;
  tokenId: string;
  fromAddress: string;
  toAddress: string;
  amount: number;
  transactionHash: string;
  logIndex: number;
  batchIndex: number;
  blockHash: string;
  timestamp: number;
};
