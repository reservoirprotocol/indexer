import { idb, pgp } from "@/common/db";
import { RabbitMQMessage } from "@/common/rabbit-mq";
import { redis } from "@/common/redis";
import { DbEvent, getEventKind } from "@/events-sync/storage/nft-transfer-events";
import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { getRouters } from "@/utils/routers";

interface BackfillAirdropsJobPayload {
  offset?: number;
}
export class BackfillAirdropsJob extends AbstractRabbitMqJobHandler {
  queueName = "backfill-airdrops";
  maxRetries = 10;
  concurrency = 1;
  persistent = false;
  lazyMode = false;
  singleActiveConsumer = true;

  public async process(payload: BackfillAirdropsJobPayload) {
    const { offset = 0 } = payload;
    const routers = await getRouters();

    const blocksPerBatch = 1;
    let blockRangeRedis = await redis.get(`${this.queueName}:blockRange`);
    if (!blockRangeRedis) {
      // query nft_transfer_events to find the first and last block number
      const blockRange = await idb.oneOrNone(
        `
        SELECT MIN(block) as min_block_number, MAX(block) as max_block_number
        FROM nft_transfer_events
        `
      );

      if (blockRange) {
        await redis.set(
          `${this.queueName}:blockRange`,
          JSON.stringify([blockRange.max_block_number, blockRange.min_block_number])
        );
        blockRangeRedis = JSON.stringify([
          blockRange.max_block_number,
          blockRange.min_block_number,
        ]);
      }
    }

    const [startBlock, endBlock] = blockRangeRedis ? JSON.parse(blockRangeRedis) : [0, 0];

    const blockValues = {
      startBlock: startBlock, // max block number in db
      endBlock: Math.max(endBlock, startBlock - blocksPerBatch), // max block number in db - blocksPerBatch
    };

    const transferEvents = await idb.manyOrNone(
      `
    SELECT 
      nft_transfer_events.from, 
      nft_transfer_events.to, 
      nft_transfer_events.tx_hash,
      nft_transfer_events.log_index,
      nft_transfer_events.address,
      nft_transfer_events.token_id,
      transactions.to as transaction_to,
      transactions.from as transaction_from
    FROM nft_transfer_events
    LEFT JOIN transactions ON transactions.hash = nft_transfer_events.tx_hash
    WHERE block <= $/startBlock/
      AND block >= $/endBlock/
      AND nft_transfer_events.kind IS NULL
    ORDER BY block ASC
    LIMIT 500
    ${offset ? `OFFSET ${offset}` : ""}
    `,
      blockValues
    );

    const queries: string[] = [];
    if (transferEvents?.length) {
      transferEvents?.forEach(
        (transferEvent: {
          from: string;
          to: string;
          tx_hash: string;
          log_index: number;
          address: string;
          token_id: string;
          transaction_to: string;
          transaction_from: string;
        }) => {
          const kind: DbEvent["kind"] = getEventKind(
            {
              from: transferEvent.from,
              to: transferEvent.to,
              baseEventParams: {
                from: transferEvent.transaction_from,
                to: transferEvent.transaction_to,
              },
            },
            routers
          );

          queries.push(
            `UPDATE nft_transfer_events 
           SET kind = '${pgp.as.value(kind)}', updated_at = now()
           WHERE tx_hash = ${pgp.as.buffer(() => transferEvent.tx_hash)}
           AND log_index = ${pgp.as.value(transferEvent.log_index)};`
          );

          if (kind === "airdrop") {
            queries.push(
              `UPDATE nft_balances
            SET is_airdropped = true
            WHERE contract = ${pgp.as.buffer(() => transferEvent.address)}
            AND token_id = ${pgp.as.value(transferEvent.token_id)}
            AND owner = ${pgp.as.buffer(() => transferEvent.to)}
            AND amount > 0`
            );
          }
        }
      );
    }

    if (queries.length) {
      // split into batches of 50
      const batches = [];
      for (let i = 0; i < queries.length; i += 50) {
        batches.push(queries.slice(i, i + 50));
      }

      for (const batch of batches) {
        await idb.manyOrNone(pgp.helpers.concat(batch));
      }
    }

    if (transferEvents?.length < 500) {
      await redis.set(
        `${this.queueName}:blockRange`,
        JSON.stringify([blockValues.endBlock, endBlock])
      );
    }

    if (blockValues.endBlock > endBlock) {
      return {
        addToQueue: true,
        offset: transferEvents?.length === 500 ? offset + 500 : 0,
      };
    }
  }

  public async onCompleted(
    rabbitMqMessage: RabbitMQMessage,
    processResult: {
      addToQueue: boolean;
      offset: number;
    }
  ) {
    if (processResult.addToQueue) {
      await this.addToQueue({ offset: processResult.offset }, 1000);
    }
  }

  public async addToQueue(payload: BackfillAirdropsJobPayload, delay = 0) {
    await this.send({ payload }, delay);
  }
}

export const backfillAirdropsJob = new BackfillAirdropsJob();
