import { Wallet } from "@ethersproject/wallet";

import { idb, pgp } from "@/common/db";
import { config } from "@/config/index";
import { orderUpdatesByIdJob } from "@/jobs/order-updates/order-updates-by-id-job";

export * as paymentProcessorV2 from "@/utils/offchain-cancel/payment-processor-v2";
export * as seaport from "@/utils/offchain-cancel/seaport";

export const cosigner = () => new Wallet(config.cosignerPrivateKey);

export const saveOffChainCancellations = async (orderIds: string[]) => {
  const columns = new pgp.helpers.ColumnSet(
    ["order_id", { name: "timestamp", mod: ":raw", init: () => "now()" }],
    {
      table: "off_chain_cancellations",
    }
  );
  await idb.none(
    pgp.helpers.insert(
      orderIds.map((orderId) => ({ orderId })),
      columns
    ) + " ON CONFLICT DO NOTHING"
  );

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
