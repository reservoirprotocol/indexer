import { ActivitiesEntityInsertParams, ActivityType } from "@/models/activities/activities-entity";
import { Tokens } from "@/models/tokens";
import _ from "lodash";
import { Activities } from "@/models/activities";
import { AddressZero } from "@ethersproject/constants";
import { getActivityHash } from "@/jobs/activities/utils";
import { UserActivitiesEntityInsertParams } from "@/models/user-activities/user-activities-entity";
import { UserActivities } from "@/models/user-activities";
import * as fixActivitiesMissingCollection from "@/jobs/activities/fix-activities-missing-collection";

export class TransferActivity {
  public static async handleEvent(data: NftTransferEventData) {
    const collectionId = await Tokens.getCollectionId(data.contract, data.tokenId);

    const activityHash = getActivityHash(
      data.transactionHash,
      data.logIndex.toString(),
      data.batchIndex.toString()
    );

    const activity = {
      type: data.fromAddress == AddressZero ? ActivityType.mint : ActivityType.transfer,
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

    if (data.fromAddress != AddressZero) {
      // One record for the user from address if not a mint event
      const fromUserActivity = _.clone(activity) as UserActivitiesEntityInsertParams;
      fromUserActivity.address = data.fromAddress;
      userActivities.push(fromUserActivity);
    }

    await Promise.all([
      Activities.addActivities([activity]),
      UserActivities.addActivities(userActivities),
    ]);

    // If collection information is not available yet when a mint event
    if (!collectionId && data.fromAddress == AddressZero) {
      await fixActivitiesMissingCollection.addToQueue(data.contract, data.tokenId);
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
