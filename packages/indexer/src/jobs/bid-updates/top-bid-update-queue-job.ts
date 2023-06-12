import { idb } from "@/common/db";
import { fromBuffer, toBuffer } from "@/common/utils";
import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";

export type TopBidUpdateQueueJobPayload = {
  tokenSetId: string;
  contract: string | null;
  tokenId: string | null;
};

export class TopBidUpdateQueueJob extends AbstractRabbitMqJobHandler {
  queueName = "top-bid-update-queue";
  maxRetries = 10;
  concurrency = 10;

  protected async process(payload: TopBidUpdateQueueJobPayload) {
    const bidUpdateBatchSize = 200;

    let continuationFilter = "";
    if (payload.contract && payload.tokenId) {
      continuationFilter = `AND (contract, token_id) > ($/contract/, $/tokenId/)`;
    }

    const query = `
        WITH "z" AS (
          SELECT "x"."contract", "x"."token_id", "y"."order_id", "y"."value", "y"."maker"
          FROM (
            SELECT "tst"."contract", "tst"."token_id"
            FROM "token_sets_tokens" "tst"
            WHERE "token_set_id" = $/tokenSetId/
            ${continuationFilter}
            ORDER BY contract, token_id ASC
            LIMIT ${bidUpdateBatchSize}
          ) "x" LEFT JOIN LATERAL (
            SELECT
              "o"."id" as "order_id",
              "o"."value",
              "o"."maker"
            FROM "orders" "o"
            JOIN "token_sets_tokens" "tst"
              ON "o"."token_set_id" = "tst"."token_set_id"
            WHERE "tst"."contract" = "x"."contract"
              AND "tst"."token_id" = "x"."token_id"
              AND "o"."side" = 'buy'
              AND "o"."fillability_status" = 'fillable'
              AND "o"."approval_status" = 'approved'
              AND EXISTS(
                SELECT FROM "nft_balances" "nb"
                  WHERE "nb"."contract" = "x"."contract"
                  AND "nb"."token_id" = "x"."token_id"
                  AND "nb"."amount" > 0
                  AND "nb"."owner" != "o"."maker"
              )
            ORDER BY "o"."value" DESC
            LIMIT 1
          ) "y" ON TRUE
        ), y AS (
          UPDATE "tokens" AS "t"
          SET "top_buy_id" = "z"."order_id",
              "top_buy_value" = "z"."value",
              "top_buy_maker" = "z"."maker",
              "updated_at" = now()
          FROM "z"
          WHERE "t"."contract" = "z"."contract"
          AND "t"."token_id" = "z"."token_id"
          AND "t"."top_buy_id" IS DISTINCT FROM "z"."order_id"
        )
        
        SELECT contract, token_id
        FROM z
        ORDER BY contract, token_id DESC
        LIMIT 1
      `;

    const result = await idb.oneOrNone(query, {
      tokenSetId: payload.tokenSetId,
      contract: payload.contract ? toBuffer(payload.contract) : "",
      tokenId: payload.tokenId,
    });

    if (!payload.tokenSetId.startsWith("token:") && result) {
      await this.addToQueue({
        tokenSetId: payload.tokenSetId,
        contract: fromBuffer(result.contract),
        tokenId: result.token_id,
      });
    }
  }

  public async addToQueue(params: TopBidUpdateQueueJobPayload) {
    await this.send({ payload: params });
  }
}

export const topBidUpdateQueueJob = new TopBidUpdateQueueJob();
