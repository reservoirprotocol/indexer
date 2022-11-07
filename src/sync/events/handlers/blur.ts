import * as Sdk from "@reservoir0x/sdk";

import { idb, pgp } from "@/common/db";
import { logger } from "@/common/logger";
import { toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import { getEventData } from "@/events-sync/data";
import { EnhancedEvent, OnChainData } from "@/events-sync/handlers/utils";
import * as es from "@/events-sync/storage";
import * as utils from "@/events-sync/utils";
import * as fillUpdates from "@/jobs/fill-updates/queue";
import { getUSDAndNativePrices } from "@/utils/prices";

export const handleEvents = async (
  events: EnhancedEvent[],
  backfill?: boolean
): Promise<OnChainData> => {
  const fillEvents: es.fills.Event[] = [];

  const fillInfos: fillUpdates.FillInfo[] = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const values: any[] = [];

  // Handle the events
  for (const { kind, baseEventParams, log } of events) {
    const eventData = getEventData([kind])[0];
    switch (kind) {
      case "blur-orders-matched": {
        const { args } = eventData.abi.parseLog(log);
        let maker = args.maker.toLowerCase();
        let taker = args.taker.toLowerCase();
        const sell = args.sell;
        const sellHash = args.sellHash.toLowerCase();
        const buyHash = args.buyHash.toLowerCase();

        const routers = Sdk.Common.Addresses.Routers[config.chainId];
        if (maker in routers) {
          maker = sell.trader.toLowerCase();
        }

        // Handle: attribution
        const orderKind = "blur";
        const attributionData = await utils.extractAttributionData(
          baseEventParams.txHash,
          orderKind
        );
        if (attributionData.taker) {
          taker = attributionData.taker;
        }
        // Handle: prices

        const currency = sell.paymentToken.toLowerCase();
        const currencyPrice = sell.price.div(sell.amount).toString();
        const priceData = await getUSDAndNativePrices(
          currency,
          currencyPrice,
          baseEventParams.timestamp
        );
        if (!priceData.nativePrice) {
          // We must always have the native price
          break;
        }

        const orderSide = maker === sell.trader.toLowerCase() ? "sell" : "buy";
        const orderId = orderSide === "sell" ? sellHash : buyHash;

        fillEvents.push({
          orderKind,
          orderId,
          orderSide,
          maker,
          taker,
          price: priceData.nativePrice,
          currency,
          currencyPrice,
          usdPrice: priceData.usdPrice,
          contract: sell.collection.toLowerCase(),
          tokenId: sell.tokenId.toString(),
          amount: sell.amount.toString(),
          orderSourceId: attributionData.orderSource?.id,
          aggregatorSourceId: attributionData.aggregatorSource?.id,
          fillSourceId: attributionData.fillSource?.id,
          baseEventParams,
        });
        values.push({
          tx_hash: toBuffer(baseEventParams.txHash),
          log_index: baseEventParams.logIndex,
          batch_index: baseEventParams.batchIndex,
          order_side: orderSide,
          maker: toBuffer(maker),
          taker: toBuffer(taker),
        });

        fillInfos.push({
          context: `${orderId}-${baseEventParams.txHash}`,
          orderId: orderId,
          orderSide,
          contract: sell.collection.toLowerCase(),
          tokenId: sell.tokenId.toString(),
          amount: sell.amount.toString(),
          price: priceData.nativePrice,
          timestamp: baseEventParams.timestamp,
        });

        break;
      }
    }
  }

  if (backfill) {
    const columns = new pgp.helpers.ColumnSet(
      ["tx_hash", "log_index", "batch_index", "order_side", "maker", "taker"],
      {
        table: "fill_events_2",
      }
    );
    if (values.length) {
      logger.info(
        "debug",
        `
          UPDATE fill_events_2 SET
            order_side = x.order_side::order_side_t,
            maker = x.maker::BYTEA,
            taker = x.taker::BYTEA,
            updated_at = now()
          FROM (
            VALUES ${pgp.helpers.values(values, columns)}
          ) AS x(tx_hash, log_index, batch_index, order_side, maker, taker)
          WHERE fill_events_2.tx_hash = x.tx_hash::BYTEA
            AND fill_events_2.log_index = x.log_index::INT
            AND fill_events_2.batch_index = x.batch_index::INT
        `
      );

      await idb.none(
        `
          UPDATE fill_events_2 SET
            order_side = x.order_side::order_side_t,
            maker = x.maker::BYTEA,
            taker = x.taker::BYTEA,
            updated_at = now()
          FROM (
            VALUES ${pgp.helpers.values(values, columns)}
          ) AS x(tx_hash, log_index, batch_index, order_side, maker, taker)
          WHERE fill_events_2.tx_hash = x.tx_hash::BYTEA
            AND fill_events_2.log_index = x.log_index::INT
            AND fill_events_2.batch_index = x.batch_index::INT
        `
      );
    }

    return {};
  } else {
    return {
      fillEvents,

      fillInfos,
    };
  }
};
