import { ActivitiesEntityInsertParams, ActivityType } from "@/models/activities/activities-entity";
import _ from "lodash";
import { Activities } from "@/models/activities";
import {
  getActivityHash,
  getBidInfoByOrderId,
  getBidInfoByOrderIds,
} from "@/jobs/activities/utils";
import { UserActivitiesEntityInsertParams } from "@/models/user-activities/user-activities-entity";
import { UserActivities } from "@/models/user-activities";

export class BidActivity {
  public static async handleEvent(data: NewBuyOrderEventData) {
    const [collectionId, tokenId] = await getBidInfoByOrderId(data.orderId);

    let activityHash;
    if (data.transactionHash && data.logIndex && data.batchIndex) {
      activityHash = getActivityHash(
        ActivityType.bid,
        data.transactionHash,
        data.logIndex.toString(),
        data.batchIndex.toString()
      );
    } else {
      activityHash = getActivityHash(ActivityType.bid, data.orderId);
    }

    const activity = {
      type: ActivityType.bid,
      hash: activityHash,
      contract: data.contract,
      collectionId: collectionId,
      tokenId: tokenId,
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

  public static async handleEvents(events: NewBuyOrderEventData[]) {
    const bidInfo = await getBidInfoByOrderIds(_.map(events, (e) => e.orderId));
    const activities = [];
    const userActivities = [];

    for (const data of events) {
      let activityHash;
      if (data.transactionHash && data.logIndex && data.batchIndex) {
        activityHash = getActivityHash(
          ActivityType.bid,
          data.transactionHash,
          data.logIndex.toString(),
          data.batchIndex.toString()
        );
      } else {
        activityHash = getActivityHash(ActivityType.bid, data.orderId);
      }

      const activity = {
        type: ActivityType.bid,
        hash: activityHash,
        contract: data.contract,
        collectionId: bidInfo.get(data.orderId)?.collectionId,
        tokenId: bidInfo.get(data.orderId)?.tokenId,
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

    // Insert activities in batch
    await Promise.all([
      Activities.addActivities(activities),
      UserActivities.addActivities(userActivities),
    ]);
  }
}

export type NewBuyOrderEventData = {
  orderId: string;
  contract: string;
  maker: string;
  price: number;
  amount: number;
  timestamp: number;
  orderSourceIdInt: number;
  transactionHash?: string;
  logIndex?: number;
  batchIndex?: number;
};
