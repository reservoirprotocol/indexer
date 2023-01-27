import { ActivitiesEntityInsertParams, ActivityType } from "@/models/activities/activities-entity";
import _ from "lodash";
import { Activities } from "@/models/activities";
import { getActivityHash, getBidInfoByOrderId } from "@/jobs/activities/utils";
import { UserActivitiesEntityInsertParams } from "@/models/user-activities/user-activities-entity";
import { UserActivities } from "@/models/user-activities";

export class BidCancelActivity {
  public static async handleEvent(data: BuyOrderCancelledEventData) {
    const [collectionId, tokenId] = await getBidInfoByOrderId(data.orderId);

    let activityHash;

    if (data.transactionHash) {
      activityHash = getActivityHash(
        data.transactionHash,
        data.logIndex.toString(),
        data.batchIndex.toString()
      );
    } else {
      activityHash = getActivityHash(ActivityType.bid_cancel, data.orderId);
    }

    const activity = {
      type: ActivityType.bid_cancel,
      hash: activityHash,
      contract: data.contract,
      collectionId: collectionId,
      tokenId: tokenId,
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
  }
}

export type BuyOrderCancelledEventData = {
  orderId: string;
  contract: string;
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
