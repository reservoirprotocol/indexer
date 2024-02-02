import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { idb } from "@/common/db";
import { bn, toBuffer } from "@/common/utils";
import { logger } from "@/common/logger";

export type FillUpdatesJobPayload = {
  context: string;
  orderId?: string;
  orderSide: "buy" | "sell";
  contract: string;
  tokenId: string;
  amount: string;
  price: string;
  timestamp: number;
  maker: string;
  taker: string;
};

export class FillUpdatesJob extends AbstractRabbitMqJobHandler {
  queueName = "fill-updates";
  maxRetries = 10;
  concurrency = 5;
  timeout = 60000;

  public async process(payload: FillUpdatesJobPayload) {
    const { orderId, orderSide, contract, tokenId, amount, price, timestamp, maker, taker } =
      payload;

    try {
      if (orderId) {
        const result = await idb.oneOrNone(
          `
              SELECT
                orders.token_set_id
              FROM orders
              WHERE orders.id = $/orderId/
            `,
          { orderId }
        );

        // If we can detect that the order was on a complex token set
        // (eg. not single token), then update the last buy caches of
        // that particular token set.
        if (result && result.token_set_id) {
          const components = result.token_set_id.split(":");
          if (components[0] !== "token") {
            await idb.none(
              `
                  UPDATE token_sets SET
                    last_buy_timestamp = $/timestamp/,
                    last_buy_value = $/price/
                  WHERE id = $/tokenSetId/
                    AND last_buy_timestamp < $/timestamp/
                `,
              {
                tokenSetId: result.token_set_id,
                timestamp,
                price,
              }
            );
          }
        }
      }

      await idb.none(
        `
                UPDATE nft_balances SET
                  last_token_appraisal_value = $/price/, updated_at = now()
                WHERE contract = $/contract/
                AND token_id = $/tokenId/
                AND owner = $/owner/
              `,
        {
          contract: toBuffer(contract),
          tokenId,
          owner: orderSide === "sell" ? toBuffer(taker) : toBuffer(maker),
          price: bn(price).div(amount).toString(),
        }
      );

      await idb.none(
        `
            UPDATE tokens SET
              last_${orderSide}_timestamp = $/timestamp/,
              last_${orderSide}_value = $/price/,
              updated_at = now()
            WHERE contract = $/contract/
              AND token_id = $/tokenId/
              AND coalesce(last_${orderSide}_timestamp, 0) < $/timestamp/
          `,
        {
          contract: toBuffer(contract),
          tokenId,
          price: bn(price).div(amount).toString(),
          timestamp,
        }
      );
    } catch (error) {
      logger.error(
        this.queueName,
        `Failed to handle fill info ${JSON.stringify(payload)}: ${error}`
      );
      throw error;
    }
  }

  public async addToQueue(fillInfos: FillUpdatesJobPayload[]) {
    await this.sendBatch(fillInfos.map((info) => ({ payload: info, jobId: info.context })));
  }
}

export const fillUpdatesJob = new FillUpdatesJob();
