import { Wallet } from "@ethersproject/wallet";

import { idb, pgp } from "@/common/db";
import { config } from "@/config/index";
import { orderUpdatesByIdJob } from "@/jobs/order-updates/order-updates-by-id-job";

export * as paymentProcessorV2 from "@/utils/offchain-cancel/payment-processor-v2";
export * as seaport from "@/utils/offchain-cancel/seaport";

export const cosigner = () => new Wallet(config.cosignerPrivateKey);

export const saveOffChainCancellations = async (orderIds: string[]) => {
  if (!orderIds.length) {
    return;
  }

  // Insert into the `off_chain_cancellations` table
  {
    const columns = new pgp.helpers.ColumnSet(
      ["order_id", { name: "timestamp", mod: ":raw", init: () => "now()" }],
      {
        table: "off_chain_cancellations",
      }
    );
    await idb.none(
      pgp.helpers.insert(
        orderIds.map((orderId) => ({ order_id: orderId })),
        columns
      ) + " ON CONFLICT DO NOTHING"
    );
  }

  // Actually mark the orders as `cancelled`
  {
    const columns = new pgp.helpers.ColumnSet(["id"], {
      table: "orders",
    });
    await idb.none(
      `
        UPDATE orders SET
          fillability_status = 'cancelled',
          updated_at = now()
        FROM (VALUES ${pgp.helpers.values(
          orderIds.map((orderId) => ({ id: orderId })),
          columns
        )}) AS x(id)
        WHERE orders.id = x.id::TEXT
          AND orders.fillability_status != 'cancelled'
      `
    );
  }

  await orderUpdatesByIdJob.addToQueue(
    orderIds.map((orderId: string) => ({
      context: `cancel-${orderId}`,
      id: orderId,
      trigger: {
        kind: "cancel",
      },
    }))
  );
};
