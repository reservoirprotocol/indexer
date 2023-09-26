import { redis } from "@/common/redis";
import _ from "lodash";
import { now } from "@/common/utils";

export type LatestBlockRealtimePayload = {
  block: number;
  timestamp?: number;
  receivedFromWebhook?: boolean;
};

export class LatestBlockRealtime {
  public key = "latest-block-realtime";

  public async set(latestBlock: LatestBlockRealtimePayload) {
    latestBlock.timestamp = latestBlock.timestamp ?? now();
    return await redis.set(this.key, JSON.stringify(latestBlock));
  }

  public async get(): Promise<LatestBlockRealtimePayload | number | null> {
    const latestBlock = await redis.get(this.key);
    if (latestBlock) {
      const block = JSON.parse(latestBlock);
      if (_.isObject(block)) {
        return (block as LatestBlockRealtimePayload).block;
      } else {
        return block;
      }
    }

    return null;
  }
}
