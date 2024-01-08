import { idb, pgp } from "@/common/db";
import { redis } from "@/common/redis";
import { DbEvent, getEventKind } from "@/events-sync/storage/nft-transfer-events";
import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { getRouters } from "@/utils/routers";

export class BackfillAirdropsJob extends AbstractRabbitMqJobHandler {
  queueName = "backfill-airdrops";
  maxRetries = 10;
  concurrency = 1;
  persistent = false;
  lazyMode = false;
  singleActiveConsumer = true;

  protected async process() {
    const routers = await getRouters();

    const blocksPerBatch = await redis.get(`${this.queueName}:blocksPerBatch`);
    const blockRangeRedis = await redis.get(`${this.queueName}:blockRange`);
    if (!blockRangeRedis) {
      // query nft_transfer_events to find the first and last block number
      const blockRange = await idb.oneOrNone(
        `
        SELECT MIN(block_number) as min_block_number, MAX(block_number) as max_block_number
        FROM nft_transfer_events
        `
      );

      if (blockRange) {
        await redis.set(
          `${this.queueName}:blockRange`,
          JSON.stringify([blockRange.min_block_number, blockRange.max_block_number])
        );
      }
    }

    const [startBlock, endBlock] = blockRangeRedis ? JSON.parse(blockRangeRedis) : [0, 0];

    const blockValues = {
      startBlock: startBlock,
      endBlock: Math.min(endBlock, startBlock + blocksPerBatch),
    };

    const transferEvents = await idb.oneOrNone(
      `
    SELECT 
      nft_transfer_events.from, 
      nft_transfer_events.to, 
      nft_transfer_events.tx_hash,
      nft_transfer_events.log_index,
      nft_transfer_events.address,
      nft_transfer_events.token_id,
      transactions.to as transaction_to,
      transactions.from as transaction_from,
    FROM nft_transfer_events
    LEFT JOIN transactions ON transactions.hash = nft_transfer_events.tx_hash
    WHERE block_number >= $/startBlock/
      AND block_number <= $/endBlock/
      AND nft_transfer_events.kind IS NULL
    ORDER BY block_number ASC
    `,
      blockValues
    );

    const queries: string[] = [];
    transferEvents.forEach(
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
           SET kind = ${pgp.as.value(kind)}
           WHERE tx_hash = ${pgp.as.buffer(() => transferEvent.tx_hash)}
           AND log_index = ${pgp.as.value(transferEvent.log_index)};  
           
           UPDATE nft_balances
           SET is_airdropped = true
           WHERE contract = ${pgp.as.buffer(() => transferEvent.address)}
           AND token_id = ${pgp.as.value(transferEvent.token_id)}
           AND owner = ${pgp.as.buffer(() => transferEvent.to)}
           `
        );
      }
    );

    await idb.manyOrNone(pgp.helpers.concat(queries));

    await redis.set(
      `${this.queueName}:blockRange`,
      JSON.stringify([blockValues.endBlock, endBlock])
    );

    // if from/end block is not the last block, add to queue
    if (blockValues.endBlock < endBlock) {
      return {
        addToQueue: true,
      };
    }
  }

  public async addToQueue(delay = 0) {
    await this.send({ payload: {} }, delay);
  }
}

export const backfillAirdropsJob = new BackfillAirdropsJob();
