import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { idb, pgp, PgPromiseQuery } from "@/common/db";
import { toBuffer } from "@/common/utils";
import { logger } from "@/common/logger";
import * as es from "@/events-sync/storage";
import { assignRoyaltiesToFillEvents } from "@/events-sync/handlers/royalties";
import { assignWashTradingScoreToFillEvents } from "@/events-sync/handlers/utils/fills";

export class FillPostProcessJob extends AbstractRabbitMqJobHandler {
  queueName = "fill-post-process";
  maxRetries = 10;
  concurrency = 10;
  lazyMode = true;
  consumerTimeout = 60000;

  protected async process(payload: es.fills.Event[]) {
    const allFillEvents = payload;

    try {
      await Promise.all([
        assignRoyaltiesToFillEvents(allFillEvents),
        assignWashTradingScoreToFillEvents(allFillEvents),
      ]);

      const queries: PgPromiseQuery[] = allFillEvents.map((event) => {
        return {
          query: `
              UPDATE fill_events_2 SET
                wash_trading_score = $/washTradingScore/,
                royalty_fee_bps = $/royaltyFeeBps/,
                marketplace_fee_bps = $/marketplaceFeeBps/,
                royalty_fee_breakdown = $/royaltyFeeBreakdown:json/,
                marketplace_fee_breakdown = $/marketplaceFeeBreakdown:json/,
                paid_full_royalty = $/paidFullRoyalty/,
                net_amount = $/netAmount/,
                updated_at = now()
              WHERE tx_hash = $/txHash/
                AND log_index = $/logIndex/
                AND batch_index = $/batchIndex/
            `,
          values: {
            washTradingScore: event.washTradingScore || 0,
            royaltyFeeBps: event.royaltyFeeBps || undefined,
            marketplaceFeeBps: event.marketplaceFeeBps || undefined,
            royaltyFeeBreakdown: event.royaltyFeeBreakdown || undefined,
            marketplaceFeeBreakdown: event.marketplaceFeeBreakdown || undefined,
            paidFullRoyalty: event.paidFullRoyalty || undefined,
            netAmount: event.netAmount || undefined,
            txHash: toBuffer(event.baseEventParams.txHash),
            logIndex: event.baseEventParams.logIndex,
            batchIndex: event.baseEventParams.batchIndex,
          },
        };
      });

      await idb.none(pgp.helpers.concat(queries));
    } catch (error) {
      logger.error(
        this.queueName,
        `Failed to handle fill info ${JSON.stringify(payload)}: ${error}`
      );
      throw error;
    }
  }

  public async addToQueue(fillInfos: es.fills.Event[][]) {
    await this.sendBatch(fillInfos.map((info) => ({ payload: info })));
  }
}

export const fillPostProcessJob = new FillPostProcessJob();
