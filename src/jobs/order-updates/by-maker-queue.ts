import { AddressZero } from "@ethersproject/constants";
import { Job, Queue, QueueScheduler, Worker } from "bullmq";

import { idb, pgp } from "@/common/db";
import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import * as orderUpdatesById from "@/jobs/order-updates/by-id-queue";
import { TriggerKind } from "@/jobs/order-updates/types";
import * as wyvernV23Utils from "@/orderbook/orders/wyvern-v2.3/utils";

const QUEUE_NAME = "order-updates-by-maker";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: "exponential",
      delay: 10000,
    },
    removeOnComplete: 10000,
    removeOnFail: 10000,
    timeout: 60000,
  },
});
new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const { context, maker, trigger, data } = job.data as MakerInfo;

      try {
        // TODO: Right now, it is assumed all results from the below queries
        // are small enough so that they can be retrieved in one go. This is
        // not going to hold for much longer so we should change the flow to
        // use keyset pagination (eg. get a batch of affected orders, handle
        // them, and then trigger the next batch). While sell side approvals
        // or balances will fit in a single batch in all cases, results from
        // the buy side can potentially span multiple batches (eg. checks on
        // the sell side will handle all of a maker's sell orders on exactly
        // a SINGLE TOKEN, while checks on the buy side will handle all of a
        // maker's buy orders on ALL TOKENS / TOKEN SETS - so buy side check
        // can potentially be more prone to not being able to handle all the
        // affected orders in a single batch).

        switch (data.kind) {
          case "buy-balance": {
            const fillabilityStatuses = await idb.manyOrNone(
              `
                SELECT
                  "o"."id",
                  "o"."fillability_status" AS "old_status",
                  (CASE
                    WHEN "fb"."amount" >= "o"."price" THEN 'fillable'
                    ELSE 'no-balance'
                  END)::order_fillability_status_t AS "new_status",
                  (CASE
                    WHEN "fb"."amount" >= "o"."price" THEN upper("o"."valid_between")
                    ELSE to_timestamp($/timestamp/)
                  END)::timestamptz AS "expiration"
                FROM "orders" "o"
                JOIN "ft_balances" "fb"
                  ON "o"."maker" = "fb"."owner"
                WHERE "o"."maker" = $/maker/
                  AND "o"."side" = 'buy'
                  AND ("o"."fillability_status" = 'fillable' OR "o"."fillability_status" = 'no-balance')
                  AND "fb"."contract" = $/contract/
              `,
              {
                maker: toBuffer(maker),
                contract: toBuffer(data.contract),
                timestamp: trigger.txTimestamp,
              }
            );

            const values = fillabilityStatuses
              .filter(({ old_status, new_status }) => old_status !== new_status)
              .map(({ id, new_status, expiration }) => ({
                id,
                fillability_status: new_status,
                expiration: expiration || "infinity",
              }));
            if (values.length) {
              const columns = new pgp.helpers.ColumnSet(
                ["id", "fillability_status", "expiration"],
                { table: "orders" }
              );

              await idb.none(
                `
                  UPDATE "orders" AS "o" SET
                    "fillability_status" = "x"."fillability_status"::order_fillability_status_t,
                    "expiration" = "x"."expiration"::timestamptz,
                    "updated_at" = now()
                  FROM (VALUES ${pgp.helpers.values(
                    values,
                    columns
                  )}) AS "x"("id", "fillability_status", "expiration")
                  WHERE "o"."id" = "x"."id"::text
                `
              );
            }

            // Re-check all affected orders
            await orderUpdatesById.addToQueue(
              fillabilityStatuses.map(({ id }) => ({
                context: `${context}-${id}`,
                id,
                trigger,
              }))
            );

            break;
          }

          case "sell-balance": {
            const fillabilityStatuses = await idb.manyOrNone(
              `
                SELECT
                  "o"."id",
                  "o"."fillability_status" AS "old_status",
                  (CASE
                    WHEN "nb"."amount" > 0 THEN 'fillable'
                    ELSE 'no-balance'
                  END)::order_fillability_status_t AS "new_status",
                  (CASE
                    WHEN "nb"."amount" > 0 THEN upper("o"."valid_between")
                    ELSE to_timestamp($/timestamp/)
                  END)::timestamptz AS "expiration"
                FROM "orders" "o"
                JOIN "nft_balances" "nb"
                  on "o"."maker" = "nb"."owner"
                JOIN "token_sets_tokens" "tst"
                  ON "o"."token_set_id" = "tst"."token_set_id"
                  AND "nb"."contract" = "tst"."contract"
                  AND "nb"."token_id" = "tst"."token_id"
                WHERE "o"."maker" = $/maker/
                  AND "o"."side" = 'sell'
                  AND ("o"."fillability_status" = 'fillable' OR "o"."fillability_status" = 'no-balance')
                  AND "nb"."contract" = $/contract/
                  AND "nb"."token_id" = $/tokenId/
              `,
              {
                maker: toBuffer(maker),
                contract: toBuffer(data.contract),
                tokenId: data.tokenId,
                timestamp: trigger.txTimestamp,
              }
            );

            const values = fillabilityStatuses
              .filter(({ old_status, new_status }) => old_status !== new_status)
              .map(({ id, new_status, expiration }) => ({
                id,
                fillability_status: new_status,
                expiration: expiration || "infinity",
              }));
            if (values.length) {
              const columns = new pgp.helpers.ColumnSet(
                ["id", "fillability_status", "expiration"],
                { table: "orders" }
              );

              await idb.none(
                `
                  UPDATE "orders" AS "o" SET
                    "fillability_status" = "x"."fillability_status"::order_fillability_status_t,
                    "expiration" = "x"."expiration"::timestamptz,
                    "updated_at" = now()
                  FROM (VALUES ${pgp.helpers.values(
                    values,
                    columns
                  )}) AS "x"("id", "fillability_status", "expiration")
                  WHERE "o"."id" = "x"."id"::text
                `
              );
            }

            // Re-check all affected orders
            await orderUpdatesById.addToQueue(
              fillabilityStatuses.map(({ id }) => ({
                context: `${context}-${id}`,
                id,
                trigger,
              }))
            );

            break;
          }

          case "sell-approval": {
            // We must detect which exchange the approval is for (if any)

            // Wyvern v2.3
            const proxy = await wyvernV23Utils.getUserProxy(maker);
            if (proxy && proxy === data.operator) {
              // For "sell" orders we can be sure the associated token set
              // consists of a single token - otherwise we should probably
              // use `DISTINCT ON ("o"."id")`.
              const result = await idb.manyOrNone(
                `
                  UPDATE "orders" AS "o" SET
                    "approval_status" = $/approvalStatus/,
                    "expiration" = to_timestamp($/expiration/),
                    "updated_at" = now()
                  FROM (
                    SELECT
                      "o"."id"
                    FROM "orders" "o"
                    JOIN "token_sets_tokens" "tst"
                      ON "o"."token_set_id" = "tst"."token_set_id"
                    WHERE "tst"."contract" = $/contract/
                      AND "o"."kind" = 'wyvern-v2.3'
                      AND "o"."maker" = $/maker/
                      AND "o"."side" = 'sell'
                      AND ("o"."fillability_status" = 'fillable' OR "o"."fillability_status" = 'no-balance')
                      AND "o"."approval_status" != $/approvalStatus/
                  ) "x"
                  WHERE "o"."id" = "x"."id"
                  RETURNING "o"."id"
                `,
                {
                  maker: toBuffer(maker),
                  contract: toBuffer(data.contract),
                  approvalStatus: data.approved ? "approved" : "no-approval",
                  expiration: trigger.txTimestamp,
                }
              );

              // Re-check all affected orders
              await orderUpdatesById.addToQueue(
                result.map(({ id }) => ({
                  context: `${context}-${id}`,
                  id,
                  trigger,
                }))
              );
            }

            break;
          }
        }
      } catch (error) {
        logger.error(
          QUEUE_NAME,
          `Failed to handle maker info ${JSON.stringify(job.data)}: ${error}`
        );
        throw error;
      }
    },
    { connection: redis.duplicate(), concurrency: 5 }
  );
  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export type MakerInfo = {
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
  maker: string;
  // Information regarding what triggered the job
  trigger: {
    kind: TriggerKind;
    txHash: string;
    txTimestamp: number;
  };
  data:
    | {
        kind: "buy-balance";
        contract: string;
      }
    | {
        kind: "sell-balance";
        contract: string;
        tokenId: string;
      }
    | {
        kind: "sell-approval";
        contract: string;
        operator: string;
        approved: boolean;
      };
};

export const addToQueue = async (makerInfos: MakerInfo[]) => {
  // Ignore empty makers
  makerInfos = makerInfos.filter(({ maker }) => maker !== AddressZero);

  await queue.addBulk(
    makerInfos.map((makerInfo) => ({
      name: makerInfo.maker,
      data: makerInfo,
      opts: {
        // We should make sure not to perform any expensive work more
        // than once. As such, we keep the last performed jobs in the
        // queue and give all jobs a deterministic id so that we skip
        // handling jobs that already got executed.
        jobId: makerInfo.context,
      },
    }))
  );
};
