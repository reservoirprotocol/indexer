import { idb } from "@/common/db";

import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { RabbitMQMessage } from "@/common/rabbit-mq";
import _ from "lodash";
import { fromBuffer, toBuffer } from "@/common/utils";
import { AddressZero } from "@ethersproject/constants";
import { acquireLock } from "@/common/redis";
import { resyncUserCollectionsJob } from "@/jobs/nft-balance-updates/reynsc-user-collections-job";

export type BackfillActiveUserCollectionsJobCursorInfo = {
  lastUpdatedAt: string;
  limit?: number;
};

export class BackfillActiveUserCollectionsJob extends AbstractRabbitMqJobHandler {
  queueName = "backfill-active-user-collections";
  maxRetries = 10;
  concurrency = 1;
  persistent = false;
  lazyMode = false;
  singleActiveConsumer = true;

  protected async process(payload: BackfillActiveUserCollectionsJobCursorInfo) {
    const { lastUpdatedAt, limit } = payload;
    const values: {
      limit: number;
      AddressZero: Buffer;
      deadAddress: Buffer;
      owner?: Buffer;
      acquiredAt?: string;
    } = {
      limit: limit ?? 1000,
      AddressZero: toBuffer(AddressZero),
      deadAddress: toBuffer("0x000000000000000000000000000000000000dead"),
    };

    let updatedAtFilter = "";
    if (lastUpdatedAt) {
      updatedAtFilter = `AND updated_at < '${lastUpdatedAt}'`;
    }

    const query = `
      SELECT nte.to as "owner", updated_at
      FROM nft_transfer_events nte
      WHERE updated_at < now() - INTERVAL '12 months'
      AND updated_at > now() - INTERVAL '18 months'
      AND nte.to NOT IN ($/AddressZero/, $/deadAddress/)
      ${updatedAtFilter}
      ORDER BY updated_at DESC
      LIMIT $/limit/
    `;

    const results = await idb.manyOrNone(query, values);

    if (results) {
      const jobs = [];

      for (const result of results) {
        // Check if the user was already synced
        const lock = `backfill-active-users-supply:${fromBuffer(result.owner)}`;

        if (await acquireLock(lock, 60 * 60 * 12)) {
          jobs.push({
            user: fromBuffer(result.owner),
          });
        }
      }

      if (!_.isEmpty(jobs)) {
        // Trigger resync for the user
        await resyncUserCollectionsJob.addToQueue(jobs);
      }
    }

    // Check if there are more potential users to sync
    if (results.length == values.limit) {
      const lastItem = _.last(results);

      return {
        addToQueue: true,
        cursor: {
          lastUpdatedAt: lastItem.updated_at.toISOString(),
          limit:
            lastItem.updated_at.toISOString() === lastUpdatedAt
              ? _.min([(values.limit += 1000), 15000])
              : undefined,
        },
      };
    }

    return { addToQueue: false };
  }

  public async onCompleted(
    rabbitMqMessage: RabbitMQMessage,
    processResult: {
      addToQueue: boolean;
      cursor?: BackfillActiveUserCollectionsJobCursorInfo;
    }
  ) {
    if (processResult.addToQueue) {
      await this.addToQueue(processResult.cursor);
    }
  }

  public async addToQueue(cursor?: BackfillActiveUserCollectionsJobCursorInfo, delay = 0) {
    await this.send({ payload: cursor ?? {} }, delay);
  }
}

export const backfillActiveUserCollectionsJob = new BackfillActiveUserCollectionsJob();

// if (config.chainId !== 1) {
//   redlock
//     .acquire(["backfill-user-collections-lock-4"], 60 * 60 * 24 * 30 * 1000)
//     .then(async () => {
//       await backfillUserCollectionsJob.addToQueue().
//     })
//     .catch(() => {
//       // Skip on any errors
//     });
// }
