import { idb } from "@/common/db";

export async function getOrder(
  orderId: string
): Promise<{ fillability_status: string; approval_status: string }> {
  const [order] = await Promise.all([
    idb.oneOrNone(
      `SELECT fillability_status, approval_status FROM "orders" "o" WHERE "o"."id" = $/id/`,
      {
        id: orderId,
      }
    ),
  ]);
  return order;
}
