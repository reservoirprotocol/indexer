import { ActivitiesEntityInsertParams, ActivityType } from "@/models/activities/activities-entity";
import { Tokens } from "@/models/tokens";
import _ from "lodash";
import { Activities } from "@/models/activities";
import { getActivityHash } from "@/jobs/activities/utils";
import { UserActivitiesEntityInsertParams } from "@/models/user-activities/user-activities-entity";
import { UserActivities } from "@/models/user-activities";
import { AddressZero } from "@ethersproject/constants";
import { config } from "@/config/index";

import * as ActivitiesIndex from "@/elasticsearch/indexes/activities";
import { FillEventCreatedEventHandler } from "@/elasticsearch/indexes/activities/event-handlers/fill-event-created";

export class SaleActivity {
  public static async handleEvent(data: FillEventData) {
    const collectionId = await Tokens.getCollectionId(data.contract, data.tokenId);

    const activityHash = getActivityHash(
      data.transactionHash,
      data.logIndex.toString(),
      data.batchIndex.toString()
    );

    const activity = {
      type: data.fromAddress === AddressZero ? ActivityType.mint : ActivityType.sale,
      hash: activityHash,
      contract: data.contract,
      collectionId,
      tokenId: data.tokenId,
      orderId: data.orderId,
      fromAddress: data.fromAddress,
      toAddress: data.toAddress,
      price: data.price,
      amount: data.amount,
      blockHash: data.blockHash,
      eventTimestamp: data.timestamp,
      metadata: {
        transactionHash: data.transactionHash,
        logIndex: data.logIndex,
        batchIndex: data.batchIndex,
        orderId: data.orderId,
        orderSourceIdInt: data.orderSourceIdInt,
      },
    } as ActivitiesEntityInsertParams;

    // One record for the user to address, One record for the user from address
    const toUserActivity = _.clone(activity) as UserActivitiesEntityInsertParams;
    const fromUserActivity = _.clone(activity) as UserActivitiesEntityInsertParams;

    toUserActivity.address = data.toAddress;
    fromUserActivity.address = data.fromAddress;

    await Promise.all([
      Activities.addActivities([activity]),
      UserActivities.addActivities([fromUserActivity, toUserActivity]),
    ]);

    if (config.doElasticsearchWork) {
      const eventHandler = new FillEventCreatedEventHandler(
        data.transactionHash,
        data.logIndex,
        data.batchIndex
      );
      const activity = await eventHandler.generateActivity();

      await ActivitiesIndex.save([activity]);
    }
  }

  public static async handleEvents(events: FillEventData[]) {
    const collectionIds = await Tokens.getCollectionIds(
      _.map(events, (d) => ({ contract: d.contract, tokenId: d.tokenId }))
    );
    const activities = [];
    const userActivities = [];
    const esActivities = [];

    for (const data of events) {
      const activityHash = getActivityHash(
        data.transactionHash,
        data.logIndex.toString(),
        data.batchIndex.toString()
      );

      const activity = {
        type: data.fromAddress === AddressZero ? ActivityType.mint : ActivityType.sale,
        hash: activityHash,
        contract: data.contract,
        collectionId: collectionIds?.get(`${data.contract}:${data.tokenId}`),
        tokenId: data.tokenId,
        orderId: data.orderId,
        fromAddress: data.fromAddress,
        toAddress: data.toAddress,
        price: data.price,
        amount: data.amount,
        blockHash: data.blockHash,
        eventTimestamp: data.timestamp,
        metadata: {
          transactionHash: data.transactionHash,
          logIndex: data.logIndex,
          batchIndex: data.batchIndex,
          orderId: data.orderId,
          orderSourceIdInt: data.orderSourceIdInt,
        },
      } as ActivitiesEntityInsertParams;

      // One record for the user to address, One record for the user from address
      const toUserActivity = _.clone(activity) as UserActivitiesEntityInsertParams;
      const fromUserActivity = _.clone(activity) as UserActivitiesEntityInsertParams;

      toUserActivity.address = data.toAddress;
      fromUserActivity.address = data.fromAddress;

      activities.push(activity);
      userActivities.push(fromUserActivity, toUserActivity);

      if (config.doElasticsearchWork) {
        const eventHandler = new FillEventCreatedEventHandler(
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

export type FillEventData = {
  contract: string;
  tokenId: string;
  fromAddress: string;
  toAddress: string;
  price: number;
  amount: number;
  transactionHash: string;
  logIndex: number;
  batchIndex: number;
  blockHash: string;
  timestamp: number;
  orderId: string;
  orderSourceIdInt: number;
};
