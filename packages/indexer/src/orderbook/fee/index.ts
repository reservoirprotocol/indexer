import { config } from "@/config/index";
import { OrderKind } from "@/orderbook/orders";

export async function attachOrderbookFee(params: {
  fee?: string[];
  feeRecipient?: string[];
  orderKind: OrderKind;
  orderbook: string;
}) {
  if (params.orderbook != "reservoir") {
    return;
  }

  const singleFeeOrderKinds = ["payment-processor", "payment-processor-v2"];
  if (config.orderbookFeeRecipient) {
    params.fee = params.fee ?? [];
    params.feeRecipient = params.feeRecipient ?? [];
    // Skip single fee marketplaces for now
    if (params.fee.length >= 1 && singleFeeOrderKinds.includes(params.orderKind)) {
      return;
    }

    params.fee.push(config.defaultOrderbookFeeBps);
    params.feeRecipient.push(config.orderbookFeeRecipient);
  }
}
