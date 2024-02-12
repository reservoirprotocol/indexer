import { idb } from "@/common/db";

import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { RabbitMQMessage } from "@/common/rabbit-mq";

export class BackfillNftTransferEventsUpdatedAtJob extends AbstractRabbitMqJobHandler {
  queueName = "backfill-nft-transfer-events-updated-at";
  maxRetries = 10;
  concurrency = 1;
  persistent = false;
  lazyMode = false;
  singleActiveConsumer = true;

  public async process() {
    const limit = 250;

    const results = await idb.result(
      `
          WITH x AS (  
            SELECT
              nft_transfer_events.tx_hash,
              nft_transfer_events.log_index,
              nft_transfer_events.batch_index,
              nft_transfer_events.created_at
            FROM nft_transfer_events
            WHERE updated_at = '2023-06-27 13:11:48.002299+00'
            LIMIT $/limit/
          )
          UPDATE nft_transfer_events SET
              updated_at = COALESCE(x.created_at, updated_at)
          FROM x
          WHERE nft_transfer_events.tx_hash = x.tx_hash
          AND nft_transfer_events.log_index = x.log_index
          AND nft_transfer_events.batch_index = x.batch_index
          `,
      {
        limit,
      }
    );

    if (results.rowCount === limit) {
      return { addToQueue: true };
    }

    return { addToQueue: false };
  }

  public async onCompleted(
    rabbitMqMessage: RabbitMQMessage,
    processResult: {
      addToQueue: boolean;
    }
  ) {
    if (processResult.addToQueue) {
      await this.addToQueue();
    }
  }

  public async addToQueue(delay = 0) {
    await this.send({}, delay);
  }
}

export const backfillNftTransferEventsUpdatedAtJob = new BackfillNftTransferEventsUpdatedAtJob();
