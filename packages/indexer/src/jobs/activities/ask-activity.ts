import { ActivitiesEntityInsertParams, ActivityType } from "@/models/activities/activities-entity";
import { Activities } from "@/models/activities";
import _ from "lodash";
import { getActivityHash } from "@/jobs/activities/utils";
import { UserActivitiesEntityInsertParams } from "@/models/user-activities/user-activities-entity";
import { UserActivities } from "@/models/user-activities";
import { Tokens } from "@/models/tokens";

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
  }

  public static async handleEvents(events: NewSellOrderEventData[]) {
    const collectionIds = await Tokens.getCollectionIds(
      _.map(events, (d) => ({ contract: d.contract, tokenId: d.tokenId }))
    );

    const activities = [];
    const userActivities = [];

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
    }

    await Promise.all([
      Activities.addActivities(activities),
      UserActivities.addActivities(userActivities),
    ]);
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
