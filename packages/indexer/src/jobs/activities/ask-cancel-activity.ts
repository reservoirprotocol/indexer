import { ActivitiesEntityInsertParams, ActivityType } from "@/models/activities/activities-entity";
import { Activities } from "@/models/activities";
import _ from "lodash";
import { getActivityHash } from "@/jobs/activities/utils";
import { UserActivitiesEntityInsertParams } from "@/models/user-activities/user-activities-entity";
import { UserActivities } from "@/models/user-activities";
import { Tokens } from "@/models/tokens";
import { config } from "@/config/index";

import * as ActivitiesIndex from "@/elasticsearch/indexes/activities";
import { AskCancelledEventHandler } from "@/elasticsearch/indexes/activities/event-handlers/ask-cancelled";

export class AskCancelActivity {
  public static async handleEvent(data: SellOrderCancelledEventData) {
    const collectionId = await Tokens.getCollectionId(data.contract, data.tokenId);

    let activityHash;
    if (data.transactionHash) {
      activityHash = getActivityHash(
        data.transactionHash,
        data.logIndex.toString(),
        data.batchIndex.toString()
      );
    } else {
      activityHash = getActivityHash(ActivityType.ask_cancel, data.orderId);
    }

    const activity = {
      hash: activityHash,
      type: ActivityType.ask_cancel,
      contract: data.contract,
      collectionId,
      tokenId: data.tokenId,
      orderId: data.orderId,
      fromAddress: data.maker,
      toAddress: null,
      price: data.price,
      amount: data.amount,
      blockHash: data.blockHash,
      eventTimestamp: data.timestamp,
      metadata: {
        orderId: data.orderId,
        transactionHash: data.transactionHash,
        logIndex: data.logIndex,
        batchIndex: data.batchIndex,
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
      const eventHandler = new AskCancelledEventHandler(
        data.orderId,
        data.transactionHash,
        data.logIndex,
        data.batchIndex
      );
      const activity = await eventHandler.generateActivity();

      await ActivitiesIndex.save([activity]);
    }
  }

  public static async handleEvents(events: SellOrderCancelledEventData[]) {
    const collectionIds = await Tokens.getCollectionIds(
      _.map(events, (d) => ({ contract: d.contract, tokenId: d.tokenId }))
    );

    const activities = [];
    const userActivities = [];
    const esActivities = [];

    for (const data of events) {
      let activityHash;
      if (data.transactionHash) {
        activityHash = getActivityHash(
          data.transactionHash,
          data.logIndex.toString(),
          data.batchIndex ? data.batchIndex.toString() : ""
        );
      } else {
        activityHash = getActivityHash(ActivityType.ask_cancel, data.orderId);
      }

      const activity = {
        hash: activityHash,
        type: ActivityType.ask_cancel,
        contract: data.contract,
        collectionId: collectionIds?.get(`${data.contract}:${data.tokenId}`),
        tokenId: data.tokenId,
        orderId: data.orderId,
        fromAddress: data.maker,
        toAddress: null,
        price: data.price,
        amount: data.amount,
        blockHash: data.blockHash,
        eventTimestamp: data.timestamp,
        metadata: {
          orderId: data.orderId,
          transactionHash: data.transactionHash,
          logIndex: data.logIndex,
          batchIndex: data.batchIndex,
          orderSourceIdInt: data.orderSourceIdInt,
        },
      } as ActivitiesEntityInsertParams;

      // One record for the user to address, One record for the user from address
      const fromUserActivity = _.clone(activity) as UserActivitiesEntityInsertParams;

      fromUserActivity.address = data.maker;

      activities.push(activity);
      userActivities.push(fromUserActivity);

      if (config.doElasticsearchWork) {
        const eventHandler = new AskCancelledEventHandler(
          data.orderId,
          data.transactionHash,
          data.logIndex,
          data.batchIndex
        );
        const esActivity = await eventHandler.generateActivity();

        esActivities.push(esActivity);
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

export type SellOrderCancelledEventData = {
  orderId: string;
  contract: string;
  tokenId: string;
  maker: string;
  price: number;
  amount: number;
  transactionHash: string;
  logIndex: number;
  batchIndex: number;
  blockHash: string;
  timestamp: number;
  orderSourceIdInt: number;
};
