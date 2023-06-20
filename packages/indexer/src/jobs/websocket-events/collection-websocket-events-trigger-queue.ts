import { Job, Queue, QueueScheduler, Worker } from "bullmq";

import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { config } from "@/config/index";

import { randomUUID } from "crypto";
import _ from "lodash";

import { publishWebsocketEvent } from "@/common/websocketPublisher";
import { redb } from "@/common/db";
import { fromBuffer, formatEth } from "@/common/utils";
import { Assets } from "@/utils/assets";

const QUEUE_NAME = "collection-websocket-events-trigger-queue";

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

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork && config.doWebsocketServerWork && config.kafkaBrokers.length > 0) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const { data } = job.data as EventInfo;

      try {
        let baseQuery = `
            SELECT
            "c"."id",
            "c"."slug",
            "c"."name",
            "c"."metadata",
            "c"."royalties",
            "c"."contract",
            "c"."token_id_range",
            "c"."token_set_id",
            "c"."day1_rank",
            "c"."day1_volume",
            "c"."day7_rank",
            "c"."day7_volume",
            "c"."day30_rank",
            "c"."day30_volume",
            "c"."all_time_rank",
            "c"."all_time_volume",
            "c"."day1_volume_change",
            "c"."day7_volume_change",
            "c"."day30_volume_change",
            "c"."day1_floor_sell_value",
            "c"."day7_floor_sell_value",
            "c"."day30_floor_sell_value",
            "c"."floor_sell_value",
            "c"."token_count",
            "c"."top_buy_id",
            "c"."top_buy_value",
            "c"."top_buy_maker",
            "ow".*,
            "attr_key".*,
            DATE_PART('epoch', LOWER("c"."top_buy_valid_between")) AS "top_buy_valid_from",
            COALESCE(
                NULLIF(DATE_PART('epoch', UPPER("c"."top_buy_valid_between")), 'Infinity'),
                0
            ) AS "top_buy_valid_until",                        
            (
                SELECT COUNT(*) FROM "tokens" "t"
                WHERE "t"."collection_id" = "c"."id"
                AND "t"."floor_sell_value" IS NOT NULL
            ) AS "on_sale_count",
            ARRAY(
                SELECT "t"."image" FROM "tokens" "t"
                WHERE "t"."collection_id" = "c"."id"
                AND "t"."image" IS NOT NULL
                LIMIT 4
            ) AS "sample_images"          
            FROM "collections" "c"
            LEFT JOIN LATERAL (
                SELECT COUNT(DISTINCT owner) AS "ownerCount"
                FROM nft_balances
                WHERE nft_balances.contract = c.contract
                AND nft_balances.token_id <@ c.token_id_range
                AND amount > 0
            ) "ow" ON TRUE
            LEFT JOIN LATERAL (
                SELECT array_agg(json_build_object('key', key, 'kind', kind, 'count', attribute_count, 'rank', rank)) AS "attributes"
                FROM attribute_keys
                WHERE attribute_keys.collection_id = c.id
                GROUP BY attribute_keys.collection_id
            ) "attr_key" ON TRUE
      `;

        // Filters

        const conditions: string[] = [];
        conditions.push(`c.id = $/id/`);

        if (conditions.length) {
          baseQuery += " WHERE " + conditions.map((c) => `(${c})`).join(" AND ");
        }

        baseQuery += ` LIMIT 1`;

        const result = await redb.oneOrNone(baseQuery, { id: data.after.id }).then((r) =>
          !r
            ? null
            : {
                id: r.id,
                slug: r.slug,
                name: r.name,
                metadata: {
                  ...r.metadata,
                  imageUrl:
                    Assets.getLocalAssetsLink(r.metadata?.imageUrl) ||
                    (r.sample_images?.length
                      ? Assets.getLocalAssetsLink(r.sample_images[0])
                      : null),
                },
                sampleImages: Assets.getLocalAssetsLink(r.sample_images) || [],
                tokenCount: String(r.token_count),
                onSaleCount: String(r.on_sale_count),
                primaryContract: fromBuffer(r.contract),
                tokenSetId: r.token_set_id,
                royalties: r.royalties ? r.royalties[0] : null,
                lastBuy: {
                  value: r.last_buy_value ? formatEth(r.last_buy_value) : null,
                  timestamp: r.last_buy_timestamp,
                },
                topBid: {
                  id: r.top_buy_id,
                  value: r.top_buy_value ? formatEth(r.top_buy_value) : null,
                  maker: r.top_buy_maker ? fromBuffer(r.top_buy_maker) : null,
                  validFrom: r.top_buy_valid_from,
                  validUntil: r.top_buy_value ? r.top_buy_valid_until : null,
                },
                rank: {
                  "1day": r.day1_rank,
                  "7day": r.day7_rank,
                  "30day": r.day30_rank,
                  allTime: r.all_time_rank,
                },
                volume: {
                  "1day": r.day1_volume ? formatEth(r.day1_volume) : null,
                  "7day": r.day7_volume ? formatEth(r.day7_volume) : null,
                  "30day": r.day30_volume ? formatEth(r.day30_volume) : null,
                  allTime: r.all_time_volume ? formatEth(r.all_time_volume) : null,
                },
                volumeChange: {
                  "1day": r.day1_volume_change,
                  "7day": r.day7_volume_change,
                  "30day": r.day30_volume_change,
                },
                floorSale: {
                  "1day": r.day1_floor_sell_value ? formatEth(r.day1_floor_sell_value) : null,
                  "7day": r.day7_floor_sell_value ? formatEth(r.day7_floor_sell_value) : null,
                  "30day": r.day30_floor_sell_value ? formatEth(r.day30_floor_sell_value) : null,
                },
                floorSaleChange: {
                  "1day": Number(r.day1_floor_sell_value)
                    ? Number(r.floor_sell_value) / Number(r.day1_floor_sell_value)
                    : null,
                  "7day": Number(r.day7_floor_sell_value)
                    ? Number(r.floor_sell_value) / Number(r.day7_floor_sell_value)
                    : null,
                  "30day": Number(r.day30_floor_sell_value)
                    ? Number(r.floor_sell_value) / Number(r.day30_floor_sell_value)
                    : null,
                },
                collectionBidSupported: Number(r.token_count) <= config.maxTokenSetSize,
                ownerCount: Number(r.ownerCount),
                attributes: _.map(_.sortBy(r.attributes, ["rank", "key"]), (attribute) => ({
                  key: attribute.key,
                  kind: attribute.kind,
                  count: Number(attribute.count),
                })),
              }
        );

        let eventType = "";
        // const changed = [];
        if (data.trigger === "insert") eventType = "collection.created";
        else if (data.trigger === "update") {
          eventType = "collection.updated";
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
            id: data.after.id,
          },
          // changed: [],
          data: result,
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
  data: CollectionWebsocketEventInfo;
};

export const addToQueue = async (events: EventInfo[]) => {
  return;

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

interface CollectionInfo {
  id: string;
  slug: string;
  name?: string;
  metadata?: object;
  sampleImages?: string[];
  tokenCount?: string;
  onSaleCount?: string;
  primaryContract?: string;
  tokenSetId?: string;
  royalties?: object;
  lastBuy?: object;
  topBid?: object;
  rank?: object;
  volume?: object;
  volumeChange?: object;
  floorSale?: object;
  floorSaleChange?: object;
  collectionBidSupported?: boolean;
  ownerCount?: number;
  attributes?: object;
}

export type CollectionWebsocketEventInfo = {
  before: CollectionInfo;
  after: CollectionInfo;
  trigger: "insert" | "update";
};
