import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { idb } from "@/common/db";
import { toBuffer } from "@/common/utils";
import { logger } from "@/common/logger";
import { Event } from "@/events-sync/storage/nft-transfer-events";
import { config } from "@/config/index";

export class TransferUpdatesJob extends AbstractRabbitMqJobHandler {
  queueName = "transfer-updates";
  maxRetries = 10;
  concurrency = [137].includes(config.chainId) ? 1 : 5;
  lazyMode = true;
  timeout = 60000;

  protected async process(payload: Event) {
    const { from, to, tokenId } = payload;
    const { address } = payload.baseEventParams;

    try {
      await idb.none(
        `
          UPDATE nft_balances
          SET last_token_appraisal_value = x.last_token_appraisal_value
          FROM (
            SELECT last_token_appraisal_value
            FROM nft_balances
            WHERE contract = $/contract/
            AND token_id = $/tokenId/
            AND owner = $/from/
            AND last_token_appraisal_value IS NOT NULL
          ) AS x
          WHERE contract = $/contract/
          AND token_id = $/tokenId/
          AND owner = $/to/
        `,
        {
          contract: toBuffer(address),
          tokenId,
          from: toBuffer(from),
          to: toBuffer(to),
        }
      );
    } catch (error) {
      logger.error(
        this.queueName,
        `Failed to handle transfer info ${JSON.stringify(payload)}: ${error}`
      );
      throw error;
    }
  }

  public async addToQueue(transferInfos: Event[]) {
    await this.sendBatch(transferInfos.map((info) => ({ payload: info })));
  }
}

export const transferUpdatesJob = new TransferUpdatesJob();
