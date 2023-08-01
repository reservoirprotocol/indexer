import { Job, Queue, QueueScheduler, Worker } from "bullmq";

import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { config } from "@/config/index";

import { randomUUID } from "crypto";
import _ from "lodash";

import { publishWebsocketEvent } from "@/common/websocketPublisher";
import { idb } from "@/common/db";
import { getJoiPriceObject } from "@/common/joi";
import { toBuffer } from "@/common/utils";
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

const changedMapping = {
  name: "name",
  description: "description",
  image: "image",
  media: "media",
  collection_id: "collection.id",
  floor_sell_id: "market.floorAsk.id",
  floor_sell_value: "market.floorAsk.price.gross.amount",
  rarity_score: "token.rarity",
  rarity_rank: "token.rarityRank",
  is_flagged: "token.isFlagged",
  last_flag_update: "token.lastFlagUpdate",
  last_flag_change: "token.lastFlagChange",
  normalized_floor_sell_id: "market.floorAskNormalized.id",
  normalized_floor_sell_value: "market.floorAskNormalized.price.gross.amount",
  supply: "token.supply",
  remaining_supply: "token.remainingSupply",
};

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork && config.doWebsocketServerWork) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const { data } = job.data as EventInfo;

      try {
        const baseQuery = `
          SELECT
            con.kind,
            c.name AS collection_name,
            c.slug,
            (c.metadata ->> 'imageUrl')::TEXT AS collection_image
          FROM contracts con
          LEFT JOIN collections c ON con.address = c.contract
          WHERE con.address = $/contract/
          ${data.after.collection_id ? "AND c.id = $/collectionId/" : ""}
          LIMIT 1
      `;

        const rawResult = await idb.manyOrNone(baseQuery, {
          contract: toBuffer(data.after.contract),
          collectionId: data.after.collection_id,
        });

        const r = rawResult[0];

        const contract = data.after.contract;
        const tokenId = data.after.token_id;
        const sources = await Sources.getInstance();

        const floorSellSource = data.after.floor_sell_value
          ? sources.get(Number(data.after.floor_sell_source_id_int), contract, tokenId)
          : undefined;

        // Use default currencies for backwards compatibility with entries
        // that don't have the currencies cached in the tokens table
        const floorAskCurrency = data.after.floor_sell_currency
          ? data.after.floor_sell_currency
          : Sdk.Common.Addresses.Native[config.chainId];

        const normalizedFloorSellSource = data.after.normalized_floor_sell_value
          ? sources.get(Number(data.after.normalized_floor_sell_source_id_int), contract, tokenId)
          : undefined;

        // Use default currencies for backwards compatibility with entries
        // that don't have the currencies cached in the tokens table
        const normalizedFloorAskCurrency = data.after.normalized_floor_sell_currency
          ? data.after.normalized_floor_sell_currency
          : Sdk.Common.Addresses.Native[config.chainId];

        const result = {
          token: {
            contract,
            tokenId,
            name: data.after.name,
            description: data.after.description,
            image: Assets.getLocalAssetsLink(data.after.image),
            media: data.after.media,
            kind: r?.kind,
            isFlagged: Boolean(Number(data.after.is_flagged)),
            lastFlagUpdate: data.after.last_flag_update
              ? new Date(data.after.last_flag_update).toISOString()
              : null,
            lastFlagChange: data.after.last_flag_change
              ? new Date(data.after.last_flag_change).toISOString()
              : null,
            supply: !_.isNull(data.after.supply) ? data.after.supply : null,
            remainingSupply: !_.isNull(data.after.remaining_supply)
              ? data.after.remaining_supply
              : null,
            rarity: data.after.rarity_score,
            rarityRank: data.after.rarity_rank,
            collection: {
              id: data.after.collection_id,
              name: r?.collection_name,
              image: r?.collection_image ? Assets.getLocalAssetsLink(r.collection_image) : null,
              slug: r?.slug,
            },
          },
          market: {
            floorAsk: data.after.floor_sell_value && {
              id: data.after.floor_sell_id,
              price: data.after.floor_sell_id
                ? await getJoiPriceObject(
                    {
                      gross: {
                        amount: data.after.floor_sell_currency_value ?? data.after.floor_sell_value,
                        nativeAmount: data.after.floor_sell_value,
                      },
                    },
                    floorAskCurrency,
                    undefined
                  )
                : null,
              maker: data.after.floor_sell_maker ? data.after.floor_sell_maker : null,
              validFrom: data.after.floor_sell_value ? data.after.floor_sell_valid_from : null,
              validUntil: data.after.floor_sell_value ? data.after.floor_sell_valid_to : null,

              source: {
                id: floorSellSource?.address,
                domain: floorSellSource?.domain,
                name: floorSellSource?.getTitle(),
                icon: floorSellSource?.getIcon(),
                url: floorSellSource?.metadata.url,
              },
            },
            floorAskNormalized: data.after.normalized_floor_sell_value && {
              id: data.after.normalized_floor_sell_id,
              price: data.after.normalized_floor_sell_id
                ? await getJoiPriceObject(
                    {
                      gross: {
                        amount:
                          data.after.normalized_floor_sell_currency_value ??
                          data.after.normalized_floor_sell_value,
                        nativeAmount: data.after.normalized_floor_sell_value,
                      },
                    },
                    normalizedFloorAskCurrency,
                    undefined
                  )
                : null,
              maker: data.after.normalized_floor_sell_maker
                ? data.after.normalized_floor_sell_maker
                : null,
              validFrom: data.after.normalized_floor_sell_value
                ? data.after.normalized_floor_sell_valid_from
                : null,
              validUntil: data.after.normalized_floor_sell_value
                ? data.after.normalized_floor_sell_valid_to
                : null,
              source: {
                id: normalizedFloorSellSource?.address,
                domain: normalizedFloorSellSource?.domain,
                name: normalizedFloorSellSource?.getTitle(),
                icon: normalizedFloorSellSource?.getIcon(),
                url: normalizedFloorSellSource?.metadata.url,
              },
            },
          },
          createdAt: new Date(data.after.created_at).toISOString(),
          updatedAt: new Date(data.after.updated_at).toISOString(),
        };

        let eventType = "";
        const changed = [];
        if (data.trigger === "insert") eventType = "token.created";
        else if (data.trigger === "update") {
          eventType = "token.updated";
          if (data.before) {
            for (const key in changedMapping) {
              if (data.before[key as keyof TokenInfo] !== data.after[key as keyof TokenInfo]) {
                changed.push(changedMapping[key as keyof typeof changedMapping]);
              }
            }

            if (!changed.length) {
              // logger.info(
              //   QUEUE_NAME,
              //   `No changes detected for event. before=${JSON.stringify(
              //     data.before
              //   )}, after=${JSON.stringify(data.after)}`
              // );
              return;
            }
          }
        }

        await publishWebsocketEvent({
          event: eventType,
          tags: {
            contract: contract,
          },
          changed,
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
    { connection: redis.duplicate(), concurrency: 30 }
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
  name: string;
  description: string;
  image: string;
  media: string;
  collection_id: string;
  attributes?: string;
  floor_sell_id: string;
  floor_sell_value: string;
  floor_sell_maker: string;
  floor_sell_valid_from: string;
  floor_sell_valid_to: string;
  floor_sell_source_id: string;
  floor_sell_source_id_int: string;
  floor_sell_is_reservoir?: string;
  top_buy_id?: string;
  top_buy_value?: string;
  top_buy_maker?: string;
  last_sell_timestamp?: string;
  last_sell_value?: string;
  last_buy_timestamp?: string;
  last_buy_value?: string;
  last_metadata_sync?: string;
  created_at: string;
  updated_at: string;
  rarity_score: string;
  rarity_rank: string;
  is_flagged: string;
  last_flag_update: string;
  floor_sell_currency: string;
  floor_sell_currency_value: string;
  minted_timestamp?: number;
  normalized_floor_sell_id: string;
  normalized_floor_sell_value?: string;
  normalized_floor_sell_maker: string;
  normalized_floor_sell_valid_from: string;
  normalized_floor_sell_valid_to: string;
  normalized_floor_sell_source_id_int: string;
  normalized_floor_sell_is_reservoir?: string;
  normalized_floor_sell_currency: string;
  normalized_floor_sell_currency_value: string;
  last_flag_change: string;
  supply: string;
  remaining_supply: string;
}

export type TokenWebsocketEventInfo = {
  before: TokenInfo;
  after: TokenInfo;
  trigger: "insert" | "update" | "delete";
  offset: string;
};
