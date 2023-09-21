import _ from "lodash";

import { pgp, redb } from "@/common/db";
import { logger } from "@/common/logger";
import { fromBuffer } from "@/common/utils";
import { getNetworkSettings } from "@/config/network";
import * as es from "@/events-sync/storage";
import { MintComment } from "@/events-sync/handlers/utils";

// By default, each fill event is assigned a default order source
// based on the order kind. However, that is not accurate at all,
// so the below code will join any fill events that have an order
// id which is not null to the orders table and get the accurate
// order source from there.
export const assignSourceToFillEvents = async (fillEvents: es.fills.Event[]) => {
  try {
    // Fetch the order ids associated to the passed in fill events
    const orderIds = fillEvents.map((e) => e.orderId).filter(Boolean);
    if (orderIds.length) {
      const orders = [];

      // Get the associated source for each of the above orders
      const orderIdChunks = _.chunk(orderIds, 100);
      for (const chunk of orderIdChunks) {
        const ordersChunk = await redb.manyOrNone(
          `
            SELECT
              orders.id,
              orders.source_id_int
            FROM orders
            WHERE orders.id IN ($/orderIds:list/)
              AND orders.source_id_int IS NOT NULL
          `,
          { orderIds: chunk }
        );
        orders.push(...ordersChunk);
      }

      if (orders.length) {
        // Create a mapping from order id to its source id
        const orderSourceIdByOrderId = new Map<string, number>();
        for (const order of orders) {
          orderSourceIdByOrderId.set(order.id, order.source_id_int);
        }

        fillEvents.forEach((event) => {
          if (!event.orderId) {
            return;
          }

          // If the current fill event's order has an associated source,
          // then use that as the order source for the fill event
          const orderSourceId = orderSourceIdByOrderId.get(event.orderId!);
          if (orderSourceId) {
            event.orderSourceId = orderSourceId;

            // If the fill event has no aggregator or fill source,
            // then default the fill source to the order source
            if (!event.aggregatorSourceId && !event.fillSourceId) {
              event.fillSourceId = orderSourceId;
            }
          }
        });
      }
    }
  } catch (error) {
    logger.error(
      "assign-source-to-fill-events",
      `Failed to assign sources to fill events: ${error}`
    );
  }
};

// Each fill event is assigned a wash trading score which is used
// for filtering any wash trading sales from the calculation made
// by the collection volumes processes
export const assignWashTradingScoreToFillEvents = async (fillEvents: es.fills.Event[]) => {
  const ns = getNetworkSettings();
  try {
    const inverseFillEvents: { contract: Buffer; maker: Buffer; taker: Buffer }[] = [];

    const washTradingExcludedContracts = ns.washTradingExcludedContracts;
    const washTradingWhitelistedAddresses = ns.washTradingWhitelistedAddresses;
    const washTradingBlacklistedAddresses = ns.washTradingBlacklistedAddresses;

    // Filter events that don't need to be checked for inverse sales
    const fillEventsPendingInverseCheck = fillEvents.filter(
      (e) =>
        !washTradingExcludedContracts.includes(e.contract) &&
        !washTradingWhitelistedAddresses.includes(e.maker) &&
        !washTradingWhitelistedAddresses.includes(e.taker) &&
        !washTradingBlacklistedAddresses.includes(e.maker) &&
        !washTradingBlacklistedAddresses.includes(e.taker)
    );

    const fillEventsPendingInverseCheckChunks = _.chunk(fillEventsPendingInverseCheck, 100);
    for (const fillEventsChunk of fillEventsPendingInverseCheckChunks) {
      // TODO: We should never use `raw` queries

      const inverseFillEventsFilter = fillEventsChunk.map(
        (fillEvent) =>
          `('${_.replace(fillEvent.taker, "0x", "\\x")}', '${_.replace(
            fillEvent.maker,
            "0x",
            "\\x"
          )}', '${_.replace(fillEvent.contract, "0x", "\\x")}')`
      );

      const inverseFillEventsChunkQuery = pgp.as.format(
        `
          SELECT DISTINCT contract, maker, taker from fill_events_2
          WHERE (maker, taker, contract) IN ($/inverseFillEventsFilter:raw/)
        `,
        {
          inverseFillEventsFilter: inverseFillEventsFilter.join(","),
        }
      );

      const inverseFillEventsChunk = await redb.manyOrNone(inverseFillEventsChunkQuery);
      inverseFillEvents.push(...inverseFillEventsChunk);
    }

    fillEvents.forEach((event, index) => {
      // Mark event as wash trading for any blacklisted addresses
      let washTradingDetected =
        washTradingBlacklistedAddresses.includes(event.maker) ||
        washTradingBlacklistedAddresses.includes(event.taker);

      if (!washTradingDetected) {
        // Mark event as wash trading if we find a corresponding transfer from taker
        washTradingDetected = inverseFillEvents.some((inverseFillEvent) => {
          return (
            event.maker == fromBuffer(inverseFillEvent.taker) &&
            event.taker == fromBuffer(inverseFillEvent.maker) &&
            event.contract == fromBuffer(inverseFillEvent.contract)
          );
        });
      }

      fillEvents[index].washTradingScore = Number(washTradingDetected);
    });
  } catch (error) {
    logger.error(
      "assign-wash-trading-score-to-fill-events",
      `Failed to assign wash trading scores to fill events: ${error}`
    );
  }
};

export const assignMintCommentToFillEvents = async (
  fillEvents: es.fills.Event[],
  comments: MintComment[]
) => {
  let lastCustomCommentIndex = -1;
  fillEvents.forEach((event) => {
    const sameTxComments = comments
      .filter((c) => c.baseEventParams.txHash === event.baseEventParams.txHash)
      .sort((c, b) => c.baseEventParams.logIndex - b.baseEventParams.logIndex);

    const matchedComment = sameTxComments.find(
      (c) => c.token === event.contract && c.tokenId === event.tokenId
    );
    if (matchedComment) {
      event.comment = matchedComment.comment;
    } else {
      let matchComment: MintComment | undefined;
      for (let i = 0; i < sameTxComments.length; i++) {
        const currComment = sameTxComments[i];
        const currLogIndex = currComment.baseEventParams.logIndex;

        if (
          currComment.token === event.contract &&
          currLogIndex > event.baseEventParams.logIndex &&
          i > lastCustomCommentIndex
        ) {
          matchComment = currComment;
          lastCustomCommentIndex = i;
          break;
        }
      }

      if (matchComment) {
        event.comment = matchComment.comment;
      }
    }
  });
};
