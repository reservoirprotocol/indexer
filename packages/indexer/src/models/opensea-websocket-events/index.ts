import _ from "lodash";
import { redis } from "@/common/redis";
import { BaseStreamMessage } from "@opensea/stream-js";

export type OpenseaWebsocketEvent = {
  createdAt: string;
  event: BaseStreamMessage<unknown>;
};

export class OpenseaWebsocketEvents {
  public key = "opensea-websocket-events";

  public async add(event: OpenseaWebsocketEvent[]) {
    return redis.rpush(
      this.key,
      _.map(event, (event) => JSON.stringify(event))
    );
  }

  public async get(count = 500): Promise<OpenseaWebsocketEvent[]> {
    const events = await redis.lpop(this.key, count);

    if (events) {
      return _.map(events, (event) => JSON.parse(event) as OpenseaWebsocketEvent);
    }

    return [];
  }

  public async count(): Promise<number> {
    return await redis.llen(this.key);
  }
}
