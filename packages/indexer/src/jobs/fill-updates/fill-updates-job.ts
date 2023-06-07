import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";
import { logger } from "@/common/logger";
import { idb } from "@/common/db";
import { bn, toBuffer } from "@/common/utils";

export type FillInfo = {
  // The context represents a deterministic id for what triggered
  // the job in the first place. Since this is what's going to be
  // set as the id of the job, the queue is only going to process
  // a context once (further jobs that have the same context will
  // be ignored - as long as the queue still holds past jobs with
  // the same context). It is VERY IMPORTANT to have this in mind
  // and set the contexts distinctive enough so that jobs are not
  // going to be wrongfully ignored. However, to be as performant
  // as possible it's also important to not have the contexts too
  // distinctive in order to avoid doing duplicative work.
  context: string;
  orderId?: string;
  orderSide: "buy" | "sell";
  contract: string;
  tokenId: string;
  amount: string;
  price: string;
  timestamp: number;
  maker?: string;
  taker?: string;
};

export class FillUpdatesJob extends AbstractRabbitMqJobHandler {
  queueName = "fill-updates";
  maxRetries = 5;
  concurrency = 5;
  backoff = {
    type: "exponential",
    delay: 1000,
  } as BackoffStrategy;

  protected async process(payload: FillInfo) {
    const { orderId, orderSide, contract, tokenId, amount, price, timestamp, maker, taker } =
      payload;

    try {
      logger.info(this.queueName, `Updating last sale info: ${JSON.stringify(payload)}`);

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

      // TODO: Remove condition after deployment.
      if (maker && taker) {
        logger.info(this.queueName, `Updating nft balance last sale. ${JSON.stringify(payload)}`);

        await idb.none(
          `
                UPDATE nft_balances SET
                  last_token_appraisal_value = $/price/
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
      }

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

  public async addToQueue(fillInfos: FillInfo[]) {
    await this.sendBatch(
      fillInfos.map((fillInfo) => ({ payload: fillInfo, jobId: fillInfo.context }))
    );
  }
}

export const fillUpdatesJob = new FillUpdatesJob();
