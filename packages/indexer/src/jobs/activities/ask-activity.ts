import { ActivitiesEntityInsertParams, ActivityType } from "@/models/activities/activities-entity";
import { Activities } from "@/models/activities";
import _ from "lodash";
import { getActivityHash } from "@/jobs/activities/utils";
import { UserActivitiesEntityInsertParams } from "@/models/user-activities/user-activities-entity";
import { UserActivities } from "@/models/user-activities";
import { Tokens } from "@/models/tokens";
import { config } from "@/config/index";

import * as ActivitiesIndex from "@/elasticsearch/indexes/activities";
import { AskCreatedEventHandler } from "@/elasticsearch/indexes/activities/event-handlers/ask-created";

export class AskActivity {
  public static async handleEvent(data: NewSellOrderEventData) {
    const collectionId = await Tokens.getCollectionId(data.contract, data.tokenId);

    let activityHash;
    if (data.transactionHash && data.logIndex && data.batchIndex) {
      activityHash = getActivityHash(
        ActivityType.ask,
        data.transactionHash,
        data.logIndex.toString(),
        data.batchIndex.toString()
      );
    } else {
      activityHash = getActivityHash(ActivityType.ask, data.orderId);
    }

    const activity = {
      hash: activityHash,
      type: ActivityType.ask,
      contract: data.contract,
      collectionId,
      tokenId: data.tokenId,
      orderId: data.orderId,
      fromAddress: data.maker,
      toAddress: null,
      price: data.price,
      amount: data.amount,
      blockHash: null,
      eventTimestamp: data.timestamp,
      metadata: {
        orderId: data.orderId,
        orderSourceIdInt: data.orderSourceIdInt,
      },
    } as ActivitiesEntityInsertParams;

    // One record for the user to address, One record for the user from address
    const fromUserActivity = _.clone(activity) as UserActivitiesEntityInsertParams;

    fromUserActivity.address = data.maker;

    await Promise.all([
      Activities.addActivities([activity]),
      UserActivities.addActivities([fromUserActivity]),
    ]);

    if (config.doElasticsearchWork) {
      const eventHandler = new AskCreatedEventHandler(
        data.orderId,
        data.transactionHash,
        data.logIndex,
        data.batchIndex
      );
      const activity = await eventHandler.generateActivity();

      await ActivitiesIndex.save([activity]);
    }
  }

  public static async handleEvents(events: NewSellOrderEventData[]) {
    const collectionIds = await Tokens.getCollectionIds(
      _.map(events, (d) => ({ contract: d.contract, tokenId: d.tokenId }))
    );

    const activities = [];
    const userActivities = [];
    const esActivities = [];

    for (const data of events) {
      let activityHash;
      if (data.transactionHash && data.logIndex && data.batchIndex) {
        activityHash = getActivityHash(
          ActivityType.ask,
          data.transactionHash,
          data.logIndex.toString(),
          data.batchIndex.toString()
        );
      } else {
        activityHash = getActivityHash(ActivityType.ask, data.orderId);
      }

      const activity = {
        hash: activityHash,
        type: ActivityType.ask,
        contract: data.contract,
        collectionId: collectionIds?.get(`${data.contract}:${data.tokenId}`),
        tokenId: data.tokenId,
        orderId: data.orderId,
        fromAddress: data.maker,
        toAddress: null,
        price: data.price,
        amount: data.amount,
        blockHash: null,
        eventTimestamp: data.timestamp,
        metadata: {
          orderId: data.orderId,
          orderSourceIdInt: data.orderSourceIdInt,
        },
      } as ActivitiesEntityInsertParams;

      // One record for the user to address, One record for the user from address
      const fromUserActivity = _.clone(activity) as UserActivitiesEntityInsertParams;

      fromUserActivity.address = data.maker;

      activities.push(activity);
      userActivities.push(fromUserActivity);

      if (config.doElasticsearchWork) {
        const eventHandler = new AskCreatedEventHandler(
          data.orderId,
          data.transactionHash,
          data.logIndex,
          data.batchIndex
        );
        const esActivity = await eventHandler.generateActivity();

        esActivities.push(esActivity);
      }
    }

    await Promise.all([
      Activities.addActivities(activities),
      UserActivities.addActivities(userActivities),
    ]);

    if (esActivities.length) {
      await ActivitiesIndex.save(esActivities, false);
    }
  }
}

export type NewSellOrderEventData = {
  orderId: string;
  contract: string;
  tokenId: string;
  maker: string;
  price: number;
  amount: number;
  timestamp: number;
  orderSourceIdInt: number;
  transactionHash?: string;
  logIndex?: number;
  batchIndex?: number;
};
