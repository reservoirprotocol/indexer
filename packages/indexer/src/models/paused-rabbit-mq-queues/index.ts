import { redis } from "@/common/redis";
import { format } from "date-fns";
import _ from "lodash";
import { config } from "@/config/index";

export class PausedRabbitMqQueues {
  public static key = `paused-rabbit-mq-queues:${config.chainId}`;

  public static async add(queueName: string) {
    const date = format(new Date(_.now()), "yyyy-MM-dd HH:mm:ss");
    await redis.hset(PausedRabbitMqQueues.key, queueName, date);
  }

  public static async delete(queueName: string) {
    return redis.hdel(PausedRabbitMqQueues.key, queueName);
  }

  public static async getPausedQueues() {
    const results = await redis.hgetall(PausedRabbitMqQueues.key);
    return Object.keys(results);
  }
}
