import { Job, Queue, QueueScheduler, Worker } from "bullmq";

import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { config } from "@/config/index";

import { randomUUID } from "crypto";
import _ from "lodash";

import { publishWebsocketEvent } from "@/common/websocketPublisher";
import { idb } from "@/common/db";
import { getJoiPriceObject } from "@/common/joi";
import { fromBuffer, toBuffer } from "@/common/utils";
import { Assets } from "@/utils/assets";

import * as Sdk from "@reservoir0x/sdk";
import { Sources } from "@/models/sources";

const QUEUE_NAME = "token-websocket-events-trigger-queue";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: "exponential",
      delay: 1000,
    },
    removeOnComplete: 1000,
    removeOnFail: 1000,
    timeout: 60000,
  },
});
new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

// const changedMapping = {
//   name: "name",
//   description: "description",
//   image: "image",
//   media: "media",
//   collection_id: "collection.id",
//   floor_sell_id: "market.floorAsk.id",
//   floor_sell_value: "market.floorAsk.price.gross.amount",
//   rarity_score: "token.rarity",
//   rarity_rank: "token.rarityRank",
//   is_flagged: "token.isFlagged",
//   last_flag_update: "token.lastFlagUpdate",
//   last_flag_change: "token.lastFlagChange",
//   normalized_floor_sell_id: "market.floorAskNormalized.id",
//   normalized_floor_sell_value: "market.floorAskNormalized.price.gross.amount",
//   supply: "token.supply",
//   remaining_supply: "token.remainingSupply",
// };

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork && config.doWebsocketServerWork && config.kafkaBrokers.length > 0) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const { data } = job.data as EventInfo;

      try {
        const selectFloorData = `
        t.floor_sell_id,
        t.floor_sell_maker,
        t.floor_sell_valid_from,
        t.floor_sell_valid_to,
        t.floor_sell_source_id_int,
        t.floor_sell_value,
        t.floor_sell_currency,
        t.floor_sell_currency_value,
        t.normalized_floor_sell_id,
        t.normalized_floor_sell_maker,
        t.normalized_floor_sell_valid_from,
        t.normalized_floor_sell_valid_to,
        t.normalized_floor_sell_source_id_int,
        t.normalized_floor_sell_value,
        t.normalized_floor_sell_currency,
        t.normalized_floor_sell_currency_value
      `;

        let baseQuery = `
        SELECT
          t.contract,
          t.token_id,
          t.name,
          t.description,
          t.image,
          t.media,
          t.collection_id,
          c.name AS collection_name,
          con.kind,
          ${selectFloorData},
          t.rarity_score,
          t.rarity_rank,
          t.is_flagged,
          t.last_flag_update,
          t.last_flag_change,
          c.slug,
          (c.metadata ->> 'imageUrl')::TEXT AS collection_image
        FROM tokens t
        LEFT JOIN collections c ON t.collection_id = c.id
        JOIN contracts con ON t.contract = con.address
      `;

        // Filters

        const conditions: string[] = [];
        conditions.push(`t.contract = $/contract/`);
        conditions.push(`t.token_id = $/tokenId/`);

        if (conditions.length) {
          baseQuery += " WHERE " + conditions.map((c) => `(${c})`).join(" AND ");
        }

        baseQuery += ` LIMIT 1`;

        const rawResult = await idb.manyOrNone(baseQuery, {
          contract: toBuffer(data.after.contract),
          tokenId: data.after.token_id,
        });

        const r = rawResult[0];

        const contract = fromBuffer(r.contract);
        const tokenId = r.token_id;
        const sources = await Sources.getInstance();

        const floorSellSource = r.floor_sell_value
          ? sources.get(Number(r.floor_sell_source_id_int), contract, tokenId)
          : undefined;

        // Use default currencies for backwards compatibility with entries
        // that don't have the currencies cached in the tokens table
        const floorAskCurrency = r.floor_sell_currency
          ? fromBuffer(r.floor_sell_currency)
          : Sdk.Common.Addresses.Eth[config.chainId];

        const normalizedFloorSellSource = r.normalized_floor_sell_value
          ? sources.get(Number(r.normalized_floor_sell_source_id_int), contract, tokenId)
          : undefined;

        // Use default currencies for backwards compatibility with entries
        // that don't have the currencies cached in the tokens table
        const normalizedFloorAskCurrency = r.normalized_floor_sell_currency
          ? fromBuffer(r.normalized_floor_sell_currency)
          : Sdk.Common.Addresses.Eth[config.chainId];

        const result = {
          token: {
            contract,
            tokenId,
            name: r.name,
            description: r.description,
            image: Assets.getLocalAssetsLink(r.image),
            media: r.media,
            kind: r.kind,
            isFlagged: Boolean(Number(r.is_flagged)),
            lastFlagUpdate: r.last_flag_update ? new Date(r.last_flag_update).toISOString() : null,
            lastFlagChange: r.last_flag_change ? new Date(r.last_flag_change).toISOString() : null,
            supply: !_.isNull(r.supply) ? r.supply : null,
            remainingSupply: !_.isNull(r.remaining_supply) ? r.remaining_supply : null,
            rarity: r.rarity_score,
            rarityRank: r.rarity_rank,
            collection: {
              id: r.collection_id,
              name: r.collection_name,
              image: Assets.getLocalAssetsLink(r.collection_image),
              slug: r.slug,
            },
          },
          market: {
            floorAsk: r.floor_sell_value && {
              id: r.floor_sell_id,
              price: r.floor_sell_id
                ? await getJoiPriceObject(
                    {
                      gross: {
                        amount: r.floor_sell_currency_value ?? r.floor_sell_value,
                        nativeAmount: r.floor_sell_value,
                      },
                    },
                    floorAskCurrency,
                    undefined
                  )
                : null,
              maker: r.floor_sell_maker ? fromBuffer(r.floor_sell_maker) : null,
              validFrom: r.floor_sell_value ? r.floor_sell_valid_from : null,
              validUntil: r.floor_sell_value ? r.floor_sell_valid_to : null,

              source: {
                id: floorSellSource?.address,
                domain: floorSellSource?.domain,
                name: floorSellSource?.getTitle(),
                icon: floorSellSource?.getIcon(),
                url: floorSellSource?.metadata.url,
              },
            },
            floorAskNormalized: r.normalized_floor_sell_value && {
              id: r.normalized_floor_sell_id,
              price: r.normalized_floor_sell_id
                ? await getJoiPriceObject(
                    {
                      gross: {
                        amount:
                          r.normalized_floor_sell_currency_value ?? r.normalized_floor_sell_value,
                        nativeAmount: r.normalized_floor_sell_value,
                      },
                    },
                    normalizedFloorAskCurrency,
                    undefined
                  )
                : null,
              maker: r.normalized_floor_sell_maker
                ? fromBuffer(r.normalized_floor_sell_maker)
                : null,
              validFrom: r.normalized_floor_sell_value ? r.normalized_floor_sell_valid_from : null,
              validUntil: r.normalized_floor_sell_value ? r.normalized_floor_sell_valid_to : null,
              source: {
                id: normalizedFloorSellSource?.address,
                domain: normalizedFloorSellSource?.domain,
                name: normalizedFloorSellSource?.getTitle(),
                icon: normalizedFloorSellSource?.getIcon(),
                url: normalizedFloorSellSource?.metadata.url,
              },
            },
          },
        };

        let eventType = "";
        // const changed = [];
        if (data.trigger === "insert") eventType = "token.created";
        else if (data.trigger === "update") {
          eventType = "token.updated";
          // if (data.before) {
          //   for (const key in changedMapping) {
          //     // eslint-disable-next-line
          //     // @ts-ignore
          //     if (data.before[key] && data.after[key] && data.before[key] !== data.after[key]) {
          //       changed.push(key);
          //     }
          //   }
          // }

          // if (!changed.length) {
          //   return;
          // }
        }

        await publishWebsocketEvent({
          event: eventType,
          tags: {
            contract: contract,
          },
          // changed: [],
          data: result,
          offset: data.offset,
        });
      } catch (error) {
        logger.error(
          QUEUE_NAME,
          `Error processing websocket event. data=${JSON.stringify(data)}, error=${JSON.stringify(
            error
          )}`
        );
        throw error;
      }
    },
    { connection: redis.duplicate(), concurrency: 10 }
  );

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored. error=${JSON.stringify(error)}`);
  });
}

export type EventInfo = {
  data: TokenWebsocketEventInfo;
};

export const addToQueue = async (events: EventInfo[]) => {
  if (!config.doWebsocketServerWork) {
    return;
  }

  await queue.addBulk(
    _.map(events, (event) => ({
      name: randomUUID(),
      data: event,
    }))
  );
};

interface TokenInfo {
  contract: string;
  token_id: string;
  name?: string;
  description?: string;
  image?: string;
  media?: string;
  collection_id?: string;
  attributes?: string;
  floor_sell_id?: string;
  floor_sell_value?: string;
  floor_sell_maker?: string;
  floor_sell_valid_from?: string;
  floor_sell_valid_to?: string;
  floor_sell_source_id?: string;
  floor_sell_source_id_int?: string;
  floor_sell_is_reservoir?: string;
  top_buy_id?: string;
  top_buy_value?: string;
  top_buy_maker?: string;
  last_sell_timestamp?: string;
  last_sell_value?: string;
  last_buy_timestamp?: string;
  last_buy_value?: string;
  last_metadata_sync?: string;
  created_at?: string;
  updated_at?: string;
  rarity_score?: string;
  rarity_rank?: string;
  is_flagged?: string;
  last_flag_update?: string;
  floor_sell_currency?: string;
  floor_sell_currency_value?: string;
  minted_timestamp?: number;
  normalized_floor_sell_id?: string;
  normalized_floor_sell_value?: string;
  normalized_floor_sell_maker?: string;
  normalized_floor_sell_valid_from?: string;
  normalized_floor_sell_valid_to?: string;
  normalized_floor_sell_source_id_int?: string;
  normalized_floor_sell_is_reservoir?: string;
  normalized_floor_sell_currency?: string;
  normalized_floor_sell_currency_value?: string;
  last_flag_change?: string;
  supply?: string;
  remaining_supply?: string;
}

export type TokenWebsocketEventInfo = {
  before: TokenInfo;
  after: TokenInfo;
  trigger: "insert" | "update" | "delete";
  offset: string;
};
