import { ridb } from "@/common/db";
import { Sources } from "@/models/sources";
import { fromBuffer } from "@/common/utils";
import { BaseDataSource } from "@/jobs/data-export/data-sources/index";
import * as Sdk from "@reservoir0x/sdk";
import { config } from "@/config/index";
import { getCurrency } from "@/utils/currencies";
import { AddressZero } from "@ethersproject/constants";
import { isWhitelistedCurrency } from "@/utils/prices";

export class AsksDataSource extends BaseDataSource {
  public async getSequenceData(cursor: CursorInfo | null, limit: number) {
    let continuationFilter = "";

    if (cursor) {
      continuationFilter = `AND (updated_at, id) > (to_timestamp($/updatedAt/), $/id/)`;
    }

    const query = `
        SELECT
          orders.id,
          orders.kind,
          orders.side,
          orders.token_set_id,
          orders.contract,
          orders.maker,
          orders.taker,
          orders.price,
          orders.currency,
          orders.currency_price,
          COALESCE(orders.dynamic, FALSE) AS dynamic,
          orders.quantity_filled,
          orders.quantity_remaining,
          DATE_PART('epoch', LOWER(orders.valid_between)) AS valid_from,
          COALESCE(
            NULLIF(DATE_PART('epoch', UPPER(orders.valid_between)), 'Infinity'),
            0
          ) AS valid_until,
          orders.nonce,
          orders.source_id_int,
          orders.fee_bps,
          COALESCE(
            NULLIF(DATE_PART('epoch', orders.expiration), 'Infinity'),
            0
          ) AS expiration,
          (
            CASE
              WHEN orders.fillability_status = 'filled' THEN 'filled'
              WHEN orders.fillability_status = 'cancelled' THEN 'cancelled'
              WHEN orders.fillability_status = 'expired' THEN 'expired'
              WHEN orders.fillability_status = 'no-balance' THEN 'inactive'
              WHEN orders.approval_status = 'no-approval' THEN 'inactive'
              ELSE 'active'
            END
          ) AS status,
          orders.raw_data,
          orders.created_at,
          extract(epoch from orders.updated_at) updated_ts
        FROM orders
        WHERE orders.side = 'sell'
        ${continuationFilter}
        ORDER BY updated_at, id
        LIMIT $/limit/;
      `;

    const result = await ridb.manyOrNone(query, {
      id: cursor?.id,
      updatedAt: cursor?.updatedAt,
      limit,
    });

    if (result.length) {
      const sources = await Sources.getInstance();

      const data = [];

      for (const r of result) {
        const currency = await getCurrency(
          fromBuffer(r.currency) === AddressZero
            ? Sdk.Common.Addresses.Native[config.chainId]
            : fromBuffer(r.currency)
        );

        // If the ask currency is a community token set the price to 0
        if (isWhitelistedCurrency(currency.contract)) {
          r.price = "0";
        }

        const currencyPrice = r.currency_price ?? r.price;

        const [, , tokenId] = r.token_set_id.split(":");

        let startPrice = r.price;
        let endPrice = r.price;

        if (r.raw_data) {
          switch (r.kind) {
            case "wyvern-v2.3": {
              const wyvernOrder = new Sdk.WyvernV23.Order(config.chainId, r.raw_data);
              startPrice = wyvernOrder.getMatchingPrice(r.valid_from);
              endPrice = wyvernOrder.getMatchingPrice(r.valid_until);
              break;
            }
            case "seaport": {
              const seaportOrder = new Sdk.SeaportV11.Order(config.chainId, r.raw_data);
              startPrice = seaportOrder.getMatchingPrice(r.valid_from);
              endPrice = seaportOrder.getMatchingPrice(r.valid_until);
              break;
            }
          }
        }

        const source = sources.get(r.source_id_int);

        data.push({
          id: r.id,
          kind: r.kind,
          status: r.status,
          contract: fromBuffer(r.contract),
          token_id: tokenId,
          maker: fromBuffer(r.maker),
          taker: fromBuffer(r.taker),
          price: r.price.toString(),
          currency_address: currency.contract,
          currency_symbol: currency.symbol,
          currency_price: currencyPrice ? currencyPrice.toString() : null,
          start_price: startPrice.toString(),
          end_price: endPrice.toString(),
          dynamic: r.dynamic,
          quantity: Number(r.quantity_filled) + Number(r.quantity_remaining),
          quantity_filled: Number(r.quantity_filled),
          quantity_remaining: Number(r.quantity_remaining),
          valid_from: Number(r.valid_from),
          valid_until: Number(r.valid_until),
          nonce: Number(r.nonce),
          source: source ? source.domain : null,
          fee_bps: Number(r.fee_bps),
          expiration: Number(r.expiration),
          raw_data: r.raw_data ?? null,
          created_at: new Date(r.created_at).toISOString(),
          updated_at: new Date(r.updated_ts * 1000).toISOString(),
        });
      }

      const lastResult = result[result.length - 1];

      return {
        data,
        nextCursor: {
          id: lastResult.id,
          updatedAt: lastResult.updated_ts,
        },
      };
    }

    return { data: [], nextCursor: null };
  }
}

export class AsksDataSourceV2 extends BaseDataSource {
  public async getSequenceData(cursor: CursorInfo | null, limit: number) {
    let continuationFilter = "";

    if (cursor) {
      continuationFilter = `AND (updated_at, id) > (to_timestamp($/updatedAt/), $/id/)`;
    }

    const query = `
        SELECT
          orders.id,
          orders.kind,
          orders.side,
          orders.token_set_id,
          orders.contract,
          orders.maker,
          orders.taker,
          orders.price,
          orders.currency,
          orders.currency_price,
          COALESCE(orders.dynamic, FALSE) AS dynamic,
          orders.quantity_filled,
          orders.quantity_remaining,
          DATE_PART('epoch', LOWER(orders.valid_between)) AS valid_from,
          COALESCE(
            NULLIF(DATE_PART('epoch', UPPER(orders.valid_between)), 'Infinity'),
            0
          ) AS valid_until,
          orders.nonce,
          orders.source_id_int,
          orders.fee_bps,
          COALESCE(
            NULLIF(DATE_PART('epoch', orders.expiration), 'Infinity'),
            0
          ) AS expiration,
          (
            CASE
              WHEN orders.fillability_status = 'filled' THEN 'filled'
              WHEN orders.fillability_status = 'cancelled' THEN 'cancelled'
              WHEN orders.fillability_status = 'expired' THEN 'expired'
              WHEN orders.fillability_status = 'no-balance' THEN 'inactive'
              WHEN orders.approval_status = 'no-approval' THEN 'inactive'
              ELSE 'active'
            END
          ) AS status,
          orders.raw_data,
          orders.created_at,
          extract(epoch from orders.updated_at) updated_ts
        FROM orders
        WHERE side = 'sell'
        AND updated_at < NOW() - INTERVAL '1 minutes'
        ${continuationFilter}
        ORDER BY updated_at, id
        LIMIT $/limit/;
      `;

    const result = await ridb.manyOrNone(query, {
      id: cursor?.id,
      updatedAt: cursor?.updatedAt,
      limit,
    });

    if (result.length) {
      const sources = await Sources.getInstance();

      const data = [];

      for (const r of result) {
        const currency = await getCurrency(
          fromBuffer(r.currency) === AddressZero
            ? Sdk.Common.Addresses.Native[config.chainId]
            : fromBuffer(r.currency)
        );

        const currencyPrice = r.currency_price ?? r.price;

        const [, , tokenId] = r.token_set_id.split(":");

        let startPrice = r.price;
        let endPrice = r.price;

        if (r.raw_data) {
          switch (r.kind) {
            case "wyvern-v2.3": {
              const wyvernOrder = new Sdk.WyvernV23.Order(config.chainId, r.raw_data);
              startPrice = wyvernOrder.getMatchingPrice(r.valid_from);
              endPrice = wyvernOrder.getMatchingPrice(r.valid_until);
              break;
            }
            case "seaport": {
              const seaportOrder = new Sdk.SeaportV11.Order(config.chainId, r.raw_data);
              startPrice = seaportOrder.getMatchingPrice(r.valid_from);
              endPrice = seaportOrder.getMatchingPrice(r.valid_until);
              break;
            }
          }
        }

        data.push({
          id: r.id,
          kind: r.kind,
          status: r.status,
          contract: fromBuffer(r.contract),
          token_id: tokenId,
          maker: fromBuffer(r.maker),
          taker: fromBuffer(r.taker),
          price: r.price.toString(),
          currency_address: currency.contract,
          currency_symbol: currency.symbol,
          currency_price: currencyPrice ? currencyPrice.toString() : null,
          start_price: startPrice.toString(),
          end_price: endPrice.toString(),
          dynamic: r.dynamic,
          quantity: Number(r.quantity_filled) + Number(r.quantity_remaining),
          quantity_filled: Number(r.quantity_filled),
          quantity_remaining: Number(r.quantity_remaining),
          valid_from: Number(r.valid_from),
          valid_until: Number(r.valid_until),
          nonce: Number(r.nonce),
          source: sources.get(r.source_id_int)?.domain,
          fee_bps: Number(r.fee_bps),
          expiration: Number(r.expiration),
          raw_data: r.raw_data ?? null,
          created_at: new Date(r.created_at).toISOString(),
          updated_at: new Date(r.updated_ts * 1000).toISOString(),
        });
      }

      const lastResult = result[result.length - 1];

      return {
        data,
        nextCursor: {
          id: lastResult.id,
          updatedAt: lastResult.updated_ts,
        },
      };
    }

    return { data: [], nextCursor: null };
  }
}

type CursorInfo = {
  id: number;
  updatedAt: string;
};
