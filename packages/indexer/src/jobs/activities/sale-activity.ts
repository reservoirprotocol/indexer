import { ActivitiesEntityInsertParams, ActivityType } from "@/models/activities/activities-entity";
import { Tokens } from "@/models/tokens";
import _ from "lodash";
import { Activities } from "@/models/activities";
import { getActivityHash } from "@/jobs/activities/utils";
import { UserActivitiesEntityInsertParams } from "@/models/user-activities/user-activities-entity";
import { UserActivities } from "@/models/user-activities";
import { AddressZero } from "@ethersproject/constants";

export class SaleActivity {
  public static async handleEvent(data: FillEventData) {
    // Paid mints will be recorded as mints
    if (data.fromAddress == AddressZero) {
      return;
    }

    const collectionId = await Tokens.getCollectionId(data.contract, data.tokenId);

    const activityHash = getActivityHash(
      data.transactionHash,
      data.logIndex.toString(),
      data.batchIndex.toString()
    );

    const activity = {
      type: ActivityType.sale,
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
