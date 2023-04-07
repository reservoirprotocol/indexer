import { idb, pgp } from "@/common/db";

export enum CrossPostingOrderStatus {
  pending = "pending",
  posted = "posted",
  failed = "failed",
}

export type CrossPostingOrder = {
  id?: number;
  orderId: string | null;
  kind: string;
  orderbook: string;
  source: string;
  schema: unknown;
  status: CrossPostingOrderStatus;
  statusReason: string;
  rawData: string;
};

export const saveOrder = async (
  order: CrossPostingOrder
): Promise<{ id: number; status: string }> => {
  const columns = new pgp.helpers.ColumnSet(
    ["order_id", "kind", "orderbook", "source", "schema", "status", "raw_data"],
    { table: "cross_posting_orders" }
  );

  const data = [
    {
      order_id: order.orderId,
      kind: order.kind,
      orderbook: order.orderbook,
      source: order.source,
      schema: order.schema,
      status: CrossPostingOrderStatus.pending,
      raw_data: order.rawData,
    },
  ];

  const query = pgp.helpers.insert(data, columns) + " RETURNING id, status";

  return idb.one(query);
};

export const updateOrderStatus = async (id: number, status: string, statusReason = "") =>
  idb.none(
    `
      UPDATE cross_posting_orders
      SET status = $/status/,
          status_reason = $/statusReason/,
          updated_at = now()
      WHERE id = $/id/
    `,
    {
      id,
      status,
      statusReason,
    }
  );
