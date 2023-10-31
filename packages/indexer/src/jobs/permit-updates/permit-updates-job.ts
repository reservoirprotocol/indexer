import { PermitHandler } from "@reservoir0x/sdk/dist/router/v6/permit";

import { idb, pgp } from "@/common/db";
import { logger } from "@/common/logger";
import { baseProvider } from "@/common/provider";
import { toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";
import { orderUpdatesByIdJob } from "@/jobs/order-updates/order-updates-by-id-job";

export type PermitUpdatesJobPayload = {
  kind: "eip2612";
  owner: string;
  spender: string;
  token: string;
};

export class PermitUpdatesJob extends AbstractRabbitMqJobHandler {
  queueName = "permit-updates";
  maxRetries = 10;
  concurrency = 20;
  lazyMode = true;
  backoff = {
    type: "exponential",
    delay: 10000,
  } as BackoffStrategy;

  protected async process(payload: PermitUpdatesJobPayload) {
    const { owner, spender, token } = payload;

    try {
      const relevantPermits = await idb.manyOrNone(
        `
          SELECT
            permits.id,
            permits.index,
            permits.nonce
          FROM permits
          WHERE permits.token = $/token/
            AND permits.owner = $/owner/
            AND permits.spender = $/spender/
            AND permits.is_valid
        `,
        {
          token: toBuffer(token),
          owner: toBuffer(owner),
          spender: toBuffer(spender),
        }
      );
      if (relevantPermits.length) {
        const latestNonce = await new PermitHandler(config.chainId, baseProvider).getNonce(
          token,
          owner
        );

        const invalidatedPermits = relevantPermits.filter((p) => p.nonce !== latestNonce);
        if (invalidatedPermits.length) {
          const permit = (permitId: string, permitIndex: number) => ({
            rawType: true,
            toPostgres: () => pgp.as.format("($1, $2)", [permitId, permitIndex]),
          });

          const invalidatedOrders = await idb.manyOrNone(
            `
              SELECT
                orders.id
              FROM orders
              WHERE orders.maker = $/maker/
                AND orders.side = 'buy'
                AND (orders.fillability_status = 'fillable' OR orders.fillability_status = 'no-balance')
                AND (orders.raw_data ->> 'permitId', orders.raw_data ->> 'permitIndex') IN ($/permits:list/)
            `,
            {
              maker: toBuffer(owner),
              permits: invalidatedPermits.map((p) => permit(p.id, p.index)),
            }
          );
          if (invalidatedOrders.length) {
            // Update any orders that did change status

            const values = invalidatedOrders.map(({ id }) => ({
              id,
              fillability_status: "cancelled",
            }));
            const columns = new pgp.helpers.ColumnSet(["id", "fillability_status"], {
              table: "orders",
            });

            await idb.none(
              `
                UPDATE orders SET
                  fillability_status = x.fillability_status::order_fillability_status_t,
                  updated_at = now()
                FROM (VALUES ${pgp.helpers.values(values, columns)}) AS x(id, fillability_status)
                WHERE orders.id = x.id::TEXT
              `
            );

            // Recheck all updated orders
            await orderUpdatesByIdJob.addToQueue(
              values.map(({ id }) => ({
                context: `${context}-${id}`,
                id,
                trigger: {
                  kind: "cancel",
                },
              }))
            );
          }
        }
      }
    } catch (error) {
      logger.error(
        this.queueName,
        `Failed to handle permit-updates info ${JSON.stringify(payload)}: ${error}`
      );
      throw error;
    }
  }

  public async addToQueue(permitInfos: PermitUpdatesJobPayload[]) {
    await this.sendBatch(permitInfos.map((info) => ({ payload: info })));
  }
}

export const permitUpdatesJob = new PermitUpdatesJob();
