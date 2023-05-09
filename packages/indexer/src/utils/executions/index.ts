import { Request } from "@hapi/hapi";
import { randomUUID } from "crypto";

import { idb, pgp } from "@/common/db";
import { toBuffer } from "@/common/utils";
import { config } from "@/config/index";

export type Execution = {
  requestData: object;
  apiKey?: string;
  side: "buy" | "sell";
  action: "create" | "fill";
  user: string;
  orderId: string;
  quantity: number;
  calldata?: string;
};

export class ExecutionsBuffer {
  private executions: Execution[];

  constructor() {
    this.executions = [];
  }

  public add(execution: Execution) {
    this.executions.push(execution);
  }

  public addFromRequest(
    request: Request,
    partialExecution: Pick<
      Execution,
      "side" | "action" | "user" | "orderId" | "quantity" | "calldata"
    >
  ) {
    // Skip injected requests
    if (request.headers["x-api-key"] !== config.adminApiKey) {
      this.executions.push({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        requestData: request.payload as any,
        apiKey: request.headers["x-api-key"],
        ...partialExecution,
      });
    }
  }

  public async flush() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const values: any[] = [];
    const columns = new pgp.helpers.ColumnSet(
      [
        "request_id",
        { name: "request_data", mod: ":json" },
        "api_key",
        "side",
        "action",
        "user",
        "order_id",
        "quantity",
        "calldata",
      ],
      {
        table: "executions",
      }
    );

    const requestId = randomUUID();
    for (const execution of this.executions) {
      values.push({
        request_id: requestId,
        request_data: execution.requestData,
        api_key: execution.apiKey ?? null,
        side: execution.side,
        action: execution.action,
        user: toBuffer(execution.user),
        order_id: execution.orderId,
        quantity: execution.quantity,
        calldata: execution.calldata ? toBuffer(execution.calldata) : null,
      });
    }

    if (values.length) {
      await idb.none(pgp.helpers.insert(values, columns));
    }
  }
}
