import { OrderValidationEventPayload } from "@opensea/stream-js/dist/types";

import { idb } from "@/common/db";
import { orderRevalidationsJob } from "@/jobs/order-fixes/order-revalidations-job";

export const handleEvent = async (payload: OrderValidationEventPayload) => {
  const currentStatus = await idb.oneOrNone(
    `
      SELECT
        orders.fillability_status
      FROM orders
      WHERE orders.id = $/id/
    `,
    {
      id: payload.order_hash,
    }
  );

  if (currentStatus && currentStatus.fillability_status === "cancelled") {
    await orderRevalidationsJob.addToQueue([
      {
        by: "id",
        data: { id: payload.order_hash, status: "active" },
      },
    ]);
  }

  return null;
};
