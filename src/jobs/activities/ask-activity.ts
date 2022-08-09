import { ActivitiesEntityInsertParams, ActivityType } from "@/models/activities/activities-entity";
import { Activities } from "@/models/activities";
import _ from "lodash";
import { getActivityHash } from "@/jobs/activities/utils";
import { UserActivitiesEntityInsertParams } from "@/models/user-activities/user-activities-entity";
import { UserActivities } from "@/models/user-activities";

export class AskActivity {
  public static async handleEvent(data: NewSellOrderEventData) {
    const activityHash = getActivityHash(ActivityType.ask, data.orderId);

    const activity = {
      hash: activityHash,
      type: ActivityType.ask,
      contract: data.contract,
      collectionId: data.contract,
      tokenId: data.tokenId,
      fromAddress: data.maker,
      toAddress: null,
      price: data.price,
      amount: data.amount,
      blockHash: null,
      eventTimestamp: data.timestamp,
      metadata: {
        orderId: data.orderId,
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

export type NewSellOrderEventData = {
  orderId: string;
  contract: string;
  tokenId: string;
  maker: string;
  price: number;
  amount: number;
  timestamp: number;
};
