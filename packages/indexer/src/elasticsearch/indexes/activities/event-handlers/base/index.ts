/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  ActivityBuilder,
  ActivityDocument,
  ActivityType,
} from "@/elasticsearch/indexes/activities/base";

export abstract class BaseActivityEventHandler {
  abstract getActivityId(data: any): string;

  abstract getActivityType(data: any): ActivityType;

  abstract parseEvent(data: any): void;

  public buildDocument(data: any): ActivityDocument {
    this.parseEvent(data);

    data.id = this.getActivityId(data);
    data.type = this.getActivityType(data);

    return new ActivityBuilder().buildDocument(data);
  }
}

export interface NftTransferEventInfo {
  txHash: string;
  logIndex: number;
  batchIndex: number;
  transactionHash?: string;
}

export interface OrderEventInfo {
  orderId: string;
  txHash?: string;
  logIndex?: number;
  batchIndex?: number;
  transactionHash?: string;
}
