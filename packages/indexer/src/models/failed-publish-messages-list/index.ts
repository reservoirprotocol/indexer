/* eslint-disable @typescript-eslint/no-explicit-any */

import _ from "lodash";
import { redis } from "@/common/redis";
import { RabbitMQMessage } from "@/common/rabbit-mq";

export type FailedPublishMessagesList = {
  queue: string;
  payload: RabbitMQMessage;
};

export class FailedPublishMessages {
  public key = "failed-messages";

  public async add(events: FailedPublishMessagesList[]) {
    return redis.rpush(
      this.key,
      _.map(events, (event) => JSON.stringify(event))
    );
  }

  public async get(count = 500): Promise<FailedPublishMessagesList[]> {
    const events = await redis.lpop(this.key, count);

    if (events) {
      return _.map(events, (event) => JSON.parse(event) as FailedPublishMessagesList);
    }

    return [];
  }

  public async count(): Promise<number> {
    return await redis.llen(this.key);
  }
}
