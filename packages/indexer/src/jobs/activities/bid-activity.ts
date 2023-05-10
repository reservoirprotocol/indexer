import { ActivitiesEntityInsertParams, ActivityType } from "@/models/activities/activities-entity";
import _ from "lodash";
import { Activities } from "@/models/activities";
import { getActivityHash, getBidInfoByOrderId } from "@/jobs/activities/utils";
import { UserActivitiesEntityInsertParams } from "@/models/user-activities/user-activities-entity";
import { UserActivities } from "@/models/user-activities";
import { BidActivityBuilder } from "@/elasticsearch/indexes/activities/bid";
import * as ActivitiesIndex from "@/elasticsearch/indexes/activities";
import { config } from "@/config/index";

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

    if (config.doElasticsearchWork) {
      const builder = new BidActivityBuilder();

      const activity = await builder.build({
        txHash: data.transactionHash,
        logIndex: data.logIndex,
        batchIndex: data.batchIndex,
      });

      await ActivitiesIndex.save([activity]);
    }
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
