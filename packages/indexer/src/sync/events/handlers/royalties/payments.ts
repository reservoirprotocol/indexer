import { Payment } from "@georgeroman/evm-tx-simulator/dist/types";
import { PartialFillEvent } from "@/events-sync/handlers/royalties";
import { paymentMatches } from "./core";

// Split payments by fill events
export function splitPayments(fillEvents: PartialFillEvent[], payments: Payment[]) {
  const fillEvent = fillEvents[0];
  let isReliable = false;

  const hasMultiple =
    fillEvents.length > 1 &&
    !fillEvents.every((c) => c.contract === fillEvent.contract) &&
    ["seaport", "seaport-v1.4", "wyvern-v2", "wyvern-v2.3"].includes(fillEvent.orderKind);

  if (hasMultiple && ["wyvern-v2", "wyvern-v2.3"].includes(fillEvent.orderKind)) {
    isReliable = true;
  }

  // Split payments by sale transfer
  const tmpIndexes: number[] = [];

  const chunkedFillEvents = fillEvents.map((item, index, all) => {
    const lastIndex = index == 0 ? 0 : tmpIndexes[index - 1];

    // split by token transfer
    if (["wyvern-v2", "wyvern-v2.3"].includes(fillEvent.orderKind)) {
      const matchIndex = payments.findIndex((c, index) => {
        return paymentMatches(c, item) && index >= lastIndex;
      });
      const relatedPayments = matchIndex == -1 ? [] : payments.slice(lastIndex, matchIndex);
      tmpIndexes.push(matchIndex);
      return {
        fillEvent: item,
        lastIndex,
        matchIndex,
        relatedPayments,
      };
    }

    const nextCursor = index + 1;
    const totalSize = all.length;
    const nextFillEvent = nextCursor > totalSize ? null : all[nextCursor];

    // Find the next fillEvent position
    const matchIndex = nextFillEvent
      ? payments.findIndex((c, index) =>
          fillEvent.orderSide === "sell"
            ? c.to === nextFillEvent.maker
            : c.to === nextFillEvent.taker && index >= lastIndex
        )
      : payments.findIndex(
          (c, index) =>
            (c.token.includes("erc721") || c.token.includes("erc1155")) && index >= lastIndex
        );
    const relatedPayments = matchIndex == -1 ? [] : payments.slice(lastIndex, matchIndex);
    tmpIndexes.push(matchIndex);
    return {
      fillEvent: item,
      lastIndex,
      matchIndex,
      relatedPayments,
    };
  });

  return {
    isReliable,
    hasMultiple,
    chunkedFillEvents,
  };
}
