import { idb, pgp } from "@/common/db";

export enum CrossPostingOrderStatus {
  pending = "pending",
  posted = "posted",
  failed = "failed",
}

export type CrossPostingOrder = {
  id: string;
  kind: string;
  orderbook: string;
  source: string;
  schema: unknown;
  status: CrossPostingOrderStatus;
  status_reason: string;
  rawData: string;
};

export const saveOrder = async (order: CrossPostingOrder): Promise<boolean> => {
  const columns = new pgp.helpers.ColumnSet(
    ["id", "kind", "orderbook", "source", "schema", " status", "status_reason", "raw_data"],
    { table: "cross_posting_orders" }
  );

  const data = [
    {
      id: order.id,
      kind: order.kind,
      orderbook: order.orderbook,
      source: order.source,
      schema: order.schema,
      status: CrossPostingOrderStatus.pending,
      raw_data: order.rawData,
    },
  ];

  const query = pgp.helpers.insert(data, columns) + " ON CONFLICT DO NOTHING RETURNING 1";

  return (await idb.oneOrNone(query)) === 1;
};

export const updateOrderStatus = async (orderId: string, status: string, statusReason = "") =>
  idb.none(
    `
      UPDATE cross_posting_orders
      SET status = $/status/,
          status_reason = $/statusReason/,
          updated_at = now()
      WHERE blocks.orderId = $/orderId/
    `,
    {
      orderId,
      status,
      statusReason,
    }
  );
