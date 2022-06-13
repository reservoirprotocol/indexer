import { AddressZero } from "@ethersproject/constants";
import * as Sdk from "@reservoir0x/sdk";
import { Job, Queue, QueueScheduler, Worker } from "bullmq";

import { idb, pgp } from "@/common/db";
import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { fromBuffer, toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import * as orderUpdatesById from "@/jobs/order-updates/by-id-queue";
import { TriggerKind } from "@/jobs/order-updates/types";
import * as wyvernV23Utils from "@/orderbook/orders/wyvern-v2.3/utils";
import { OrderKind } from "@/orderbook/orders";
import { fetchAndUpdateFtApproval } from "@/utils/on-chain-data";

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
                    WHEN "fb"."amount" >= ("o"."price" * "o"."quantity_remaining") THEN 'fillable'
                    ELSE 'no-balance'
                  END)::order_fillability_status_t AS "new_status",
                  (CASE
                    WHEN "fb"."amount" >= ("o"."price" * "o"."quantity_remaining") THEN upper("o"."valid_between")
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
                {
                  table: "orders",
                }
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

          case "buy-approval": {
            const { contract, orderKind, operator } = data;

            if (operator) {
              // Approval change is coming from an `Approval` event

              // TODO: Split into multiple batches to support makers with lots of orders

              // First, ensure the maker has any orders with the current `operator` as conduit
              const result = await idb.manyOrNone(
                `
                  SELECT
                    orders.id,
                    orders.price
                  FROM orders
                  WHERE orders.maker = $/maker/
                    AND orders.side = 'buy'
                    AND orders.conduit = $/conduit/
                    AND (orders.fillability_status = 'fillable' OR orders.fillability_status = 'no-balance')
                  LIMIT 1
                `,
                {
                  maker: toBuffer(maker),
                  conduit: toBuffer(operator),
                }
              );
              if (result.length) {
                // Refresh approval
                await fetchAndUpdateFtApproval(contract, maker, operator);

                // Validate or invalidate orders based on the refreshed approval
                const result = await idb.manyOrNone(
                  `
                    WITH
                      x AS (
                        SELECT
                          orders.id,
                          orders.price
                        FROM orders
                        WHERE orders.maker = $/maker/
                          AND orders.side = 'buy'
                          AND orders.conduit = $/conduit/
                          AND (orders.fillability_status = 'fillable' OR orders.fillability_status = 'no-balance')
                      ),
                      y AS (
                        SELECT
                          ft_approvals.value
                        FROM ft_approvals
                        WHERE ft_approvals.token = $/token/
                          AND ft_approvals.owner = $/maker/
                          AND ft_approvals.spender = $/conduit/
                      )
                    UPDATE orders SET
                      approval_status = (
                        CASE
                          WHEN orders.price > y.value THEN 'no-approval'
                          ELSE 'approved'
                        END
                      )::order_approval_status_t
                    FROM x LEFT JOIN y ON TRUE
                    WHERE orders.id = x.id
                      AND orders.approval_status != (
                        CASE
                          WHEN orders.price > y.value THEN 'no-approval'
                          ELSE 'approved'
                        END
                      )::order_approval_status_t
                    RETURNING orders.id
                  `,
                  {
                    token: toBuffer(contract),
                    maker: toBuffer(maker),
                    conduit: toBuffer(operator),
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
            } else if (orderKind) {
              // Approval change is coming from a `Transfer` event

              // Fetch all different conduits for the given order kind
              const result = await idb.manyOrNone(
                `
                  SELECT DISTINCT
                    orders.conduit
                  FROM orders
                  WHERE orders.maker = $/maker/
                    AND orders.side = 'buy'
                    AND orders.kind = $/kind/
                    AND (orders.fillability_status = 'fillable' OR orders.fillability_status = 'no-balance')
                `,
                {
                  maker: toBuffer(maker),
                  kind: orderKind,
                }
              );

              // Trigger a new job to individually handle all maker's conduits
              await addToQueue(
                result
                  .filter(({ conduit }) => Boolean(conduit))
                  .map(({ conduit }) => {
                    conduit = fromBuffer(conduit);
                    return {
                      context: `${context}-${conduit}`,
                      maker,
                      trigger,
                      data: {
                        kind: "buy-approval",
                        contract,
                        operator: conduit,
                      },
                    };
                  })
              );
            }

            break;
          }

          case "sell-balance": {
            const fillabilityStatuses = await idb.manyOrNone(
              `
                SELECT
                  "o"."id",
                  "o"."fillability_status" AS "old_status",
                  (CASE
                    WHEN "nb"."amount" >= "o"."quantity_remaining" THEN 'fillable'
                    ELSE 'no-balance'
                  END)::order_fillability_status_t AS "new_status",
                  (CASE
                    WHEN "nb"."amount" >= "o"."quantity_remaining" THEN upper("o"."valid_between")
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
                {
                  table: "orders",
                }
              );

              // Foundation needs special rules since it's an escrowed orderbook.
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
                    AND "o"."kind" != 'foundation'::order_kind_t
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
            // TODO: Get latest approval to operator and use that instead of
            // `approved` field that gets explicitly passed to the job.

            // We must detect which exchange the approval is for (if any).

            // For "sell" orders we can be sure the associated token set
            // consists of a single token - otherwise we should probably
            // use `DISTINCT ON ("o"."id")` - relevant to queries below.

            const result: { id: string }[] = [];

            let detected = false;

            // OpenDao
            if (data.operator === Sdk.OpenDao.Addresses.Exchange[config.chainId]?.toLowerCase()) {
              detected = true;
              for (const orderKind of ["opendao-erc721", "opendao-erc1155"]) {
                result.push(
                  ...(await idb.manyOrNone(
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
                          AND "o"."kind" = '${orderKind}'
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
                  ))
                );
              }
            }

            // ZeroExV4
            if (data.operator === Sdk.ZeroExV4.Addresses.Exchange[config.chainId]?.toLowerCase()) {
              detected = true;
              for (const orderKind of ["zeroex-v4-erc721", "zeroex-v4-erc1155"]) {
                result.push(
                  ...(await idb.manyOrNone(
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
                          AND "o"."kind" = '${orderKind}'
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
                  ))
                );
              }
            }

            // X2Y2
            if (data.operator === Sdk.X2Y2.Addresses.Exchange[config.chainId]?.toLowerCase()) {
              detected = true;
              result.push(
                ...(await idb.manyOrNone(
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
                          AND "o"."kind" = 'x2y2'
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
                ))
              );
            }

            // LooksRare
            if (
              [
                Sdk.LooksRare.Addresses.TransferManagerErc721[config.chainId]?.toLowerCase(),
                Sdk.LooksRare.Addresses.TransferManagerErc1155[config.chainId]?.toLowerCase(),
              ].includes(data.operator)
            ) {
              detected = true;
              const kind =
                data.operator ===
                Sdk.LooksRare.Addresses.TransferManagerErc721[config.chainId]?.toLowerCase()
                  ? "erc721"
                  : "erc1155";

              result.push(
                ...(await idb.manyOrNone(
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
                      JOIN "contracts" "c"
                        ON "tst"."contract" = "c"."address"
                      WHERE "tst"."contract" = $/contract/
                        AND "c"."kind" = '${kind}'
                        AND "o"."kind" = 'looks-rare'
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
                ))
              );
            }

            // Wyvern v2.3
            const proxy = await wyvernV23Utils.getUserProxy(maker);
            if (proxy && proxy === data.operator) {
              detected = true;
              result.push(
                ...(await idb.manyOrNone(
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
                ))
              );
            }

            // TODO: Backfill orders conduit and use that directly instead of
            // manually detecting and using the order kind from the operator.
            // Just like we do with Seaport, but for all orders.

            // Seaport
            if (!detected) {
              result.push(
                ...(await idb.manyOrNone(
                  `
                    UPDATE orders AS o SET
                      approval_status = $/approvalStatus/,
                      expiration = to_timestamp($/expiration/),
                      updated_at = now()
                    FROM (
                      SELECT
                        orders.id
                      FROM orders
                      JOIN token_sets_tokens
                        ON orders.token_set_id = token_sets_tokens.token_set_id
                      WHERE token_sets_tokens.contract = $/contract/
                        AND orders.maker = $/maker/
                        AND orders.side = 'sell'
                        AND orders.conduit = $/operator/
                        AND (orders.fillability_status = 'fillable' OR orders.fillability_status = 'no-balance')
                        AND orders.approval_status != $/approvalStatus/
                    ) x
                    WHERE o.id = x.id
                    RETURNING o.id
                  `,
                  {
                    maker: toBuffer(maker),
                    contract: toBuffer(data.contract),
                    operator: toBuffer(data.operator),
                    approvalStatus: data.approved ? "approved" : "no-approval",
                    expiration: trigger.txTimestamp,
                  }
                ))
              );
            }

            // Re-check all affected orders
            await orderUpdatesById.addToQueue(
              result.map(({ id }) => ({
                context: `${context}-${id}`,
                id,
                trigger,
              }))
            );

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
        kind: "buy-approval";
        contract: string;
        // Keeping track of buy approvals is trickier than keeping track of sell approvals,
        // due to the way the ERC20 standard is designed (eg. when a spender spends allowed
        // tokens, the allowance is reduced but no associated `Approval` event gets emitted
        // to be able to fully keep track of it off-chain). For this reason, we don't track
        // ERC20 approvals off-chain, but fetch them directly from the blockchain when it's
        // detected than an approval might have changed. There are three scenarios where an
        // an approval could have changed:
        // - we detect an ERC20 `Approval` event (in this case `operator` will be set and
        //   so we recheck the approvals of all orders having that `operator` as conduit)
        // - a `Transfer` event and a sale occur within the same transaction (in this case
        //   `orderKind` is going to be set and we recheck the approvals of all the orders
        //   which have that particular `orderKind`)
        orderKind?: OrderKind;
        operator?: string;
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
        // TODO: Replace explicitly passing the `approved` field with
        // fetching the latest approval directly from the database.
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
