import { redis } from "@/common/redis";
import { format } from "date-fns";
import _ from "lodash";

/**
 * Wrapper for redis hash which holds all the contracts marked as spam by alchemy
 */
export class AlchemySpamContracts {
  public static key = `alchemy-spam-contracts`;

  public static async add(contract: string) {
    const date = format(new Date(_.now()), "yyyy-MM-dd HH:mm:ss");
    await redis.hset(AlchemySpamContracts.key, contract, date);
  }

  public static async delete(contract: string) {
    await redis.hdel(AlchemySpamContracts.key, contract);
  }

  public static async exists(contract: string): Promise<number> {
    return redis.hexists(AlchemySpamContracts.key, contract);
  }

  public static async getContracts(contracts: string[]) {
    const results: { [key: string]: string | null } = {};
    const redisResult = await redis.hmget(AlchemySpamContracts.key, ...contracts);
    for (let i = 0; i < contracts.length; i++) {
      results[contracts[i]] = redisResult[i];
    }

    return results;
  }
}
