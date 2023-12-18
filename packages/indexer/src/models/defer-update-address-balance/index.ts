import { acquireLock, redis } from "@/common/redis";
import _ from "lodash";
import { config } from "@/config/index";
import cron from "node-cron";
import { logger } from "@/common/logger";
import { idb, pgp } from "@/common/db";
import { toBuffer } from "@/common/utils";

export class DeferUpdateAddressBalance {
  public static key = `defer-update-address-balance`;

  public static async add(fromAddress: string, contract: string, tokenId: string, incrementBy = 1) {
    const member = `${fromAddress}*${contract}*${tokenId}`;
    await redis.zincrby(DeferUpdateAddressBalance.key, incrementBy, member);
  }

  public static async popCounts(count = 200) {
    const results: { fromAddress: string; contract: string; tokenId: string; balance: number }[] =
      [];
    const counts = await redis.zpopmax(DeferUpdateAddressBalance.key, count);

    for (let i = 0; i < counts.length; i += 2) {
      const [fromAddress, contract, tokenId] = _.split(counts[i], "*");

      results.push({
        fromAddress,
        contract,
        tokenId,
        balance: _.toInteger(counts[i + 1]),
      });
    }

    return results;
  }
}

if (config.doBackgroundWork) {
  cron.schedule("*/30 * * * * *", async () => {
    try {
      const lock = await acquireLock("record-defer-address-balance", 30 - 5);
      if (lock) {
        const count = 200;
        let balances = [];

        do {
          balances = await DeferUpdateAddressBalance.popCounts(count);

          if (!_.isEmpty(balances)) {
            const columns = new pgp.helpers.ColumnSet(["contract", "token_id", "owner", "amount"], {
              table: "nft_balances",
            });

            const queries: string[] = [];

            for (const balance of balances) {
              queries.push(`
                INSERT INTO "nft_balances" (
                  "contract",
                  "token_id",
                  "owner",
                  "amount"
                ) VALUES ${pgp.helpers.values(
                  {
                    contract: toBuffer(balance.contract),
                    token_id: balance.tokenId,
                    owner: toBuffer(balance.fromAddress),
                    amount: balance.balance,
                  },
                  columns
                )}
               ON CONFLICT ("contract", "token_id", "owner") DO
               UPDATE SET amount = nft_balances.amount + EXCLUDED.amount`);
            }

            if (!_.isEmpty(queries)) {
              try {
                await idb.tx(async (t) => t.batch(queries.map((q) => t.none(q))));
              } catch (error) {
                // Requeue messages if transaction failed
                for (const balance of balances) {
                  await DeferUpdateAddressBalance.add(
                    balance.fromAddress,
                    balance.contract,
                    balance.tokenId,
                    balance.balance
                  );
                }

                throw error;
              }
            }
          }
        } while (balances.length === count);
      }
    } catch (error) {
      logger.error(
        "record-defer-update-address-balance",
        `failed to record defer address balance error ${error}`
      );
    }
  });
}
