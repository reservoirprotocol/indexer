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
if (config.doBackgroundWork && config.doWebsocketServerWork) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const { data } = job.data as EventInfo;

      try {
        const baseQuery = `
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
            "c"."owner_count",
            "c"."floor_sell_id",
            "c"."floor_sell_value",
            "c"."floor_sell_maker",
            least(2147483647::NUMERIC, date_part('epoch', lower("c"."floor_sell_valid_between")))::INT AS "floor_sell_valid_from",
            least(2147483647::NUMERIC, coalesce(nullif(date_part('epoch', upper("c"."floor_sell_valid_between")), 'Infinity'),0))::INT AS "floor_sell_valid_until",
            "c"."normalized_floor_sell_id",
            "c"."normalized_floor_sell_value",
            "c"."normalized_floor_sell_maker",
            least(2147483647::NUMERIC, date_part('epoch', lower("c"."normalized_floor_sell_valid_between")))::INT AS "normalized_floor_sell_valid_from",
            least(2147483647::NUMERIC, coalesce(nullif(date_part('epoch', upper("c"."normalized_floor_sell_valid_between")), 'Infinity'),0))::INT AS "normalized_floor_sell_valid_until",
            "c"."non_flagged_floor_sell_id",
            "c"."non_flagged_floor_sell_value",
            "c"."non_flagged_floor_sell_maker",
            least(2147483647::NUMERIC, date_part('epoch', lower("c"."non_flagged_floor_sell_valid_between")))::INT AS "non_flagged_floor_sell_valid_from",
            least(2147483647::NUMERIC, coalesce(nullif(date_part('epoch', upper("c"."non_flagged_floor_sell_valid_between")), 'Infinity'),0))::INT AS "non_flagged_floor_sell_valid_until",
            "c"."top_buy_id",
            "c"."top_buy_value",
            "c"."top_buy_maker",
            DATE_PART('epoch', LOWER("c"."top_buy_valid_between")) AS "top_buy_valid_from",
            COALESCE(
                NULLIF(DATE_PART('epoch', UPPER("c"."top_buy_valid_between")), 'Infinity'),
                0
            ) AS "top_buy_valid_until"        
            FROM "collections" "c"
            WHERE "c"."id" = $/id/
            LIMIT 1
      `;

        // Filters
        const result = await redb.oneOrNone(baseQuery, { id: data.after.id }).then((r) =>
          !r
            ? null
            : {
                id: r.id,
                slug: r.slug,
                name: r.name,
                metadata: {
                  ...r.metadata,
                  imageUrl: Assets.getLocalAssetsLink(r.metadata?.imageUrl),
                },
                tokenCount: String(r.token_count),
                primaryContract: fromBuffer(r.contract),
                tokenSetId: r.token_set_id,
                royalties: r.royalties ? r.royalties[0] : null,
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
                ownerCount: Number(r.owner_count),
                floorAsk: {
                  id: r.floor_sell_id,
                  price: r.floor_sell_id ? formatEth(r.floor_sell_value) : null,
                  maker: r.floor_sell_id ? fromBuffer(r.floor_sell_maker) : null,
                  validFrom: r.floor_sell_valid_from,
                  validUntil: r.floor_sell_id ? r.floor_sell_valid_until : null,
                },
                floorAskNormalized: {
                  id: r.normalized_floor_sell_id,
                  price: r.normalized_floor_sell_id
                    ? formatEth(r.normalized_floor_sell_value)
                    : null,
                  maker: r.normalized_floor_sell_id
                    ? fromBuffer(r.normalized_floor_sell_maker)
                    : null,
                  validFrom: r.normalized_floor_sell_valid_from,
                  validUntil: r.normalized_floor_sell_id
                    ? r.normalized_floor_sell_valid_until
                    : null,
                },
                floorAskNonFlagged: {
                  id: r.non_flagged_floor_sell_id,
                  price: r.non_flagged_floor_sell_id
                    ? formatEth(r.non_flagged_floor_sell_value)
                    : null,
                  maker: r.non_flagged_floor_sell_id
                    ? fromBuffer(r.non_flagged_floor_sell_maker)
                    : null,
                  validFrom: r.non_flagged_floor_sell_valid_from,
                  validUntil: r.non_flagged_floor_sell_id
                    ? r.non_flagged_floor_sell_valid_until
                    : null,
                },
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
  tokenCount?: string;
  primaryContract?: string;
  tokenSetId?: string;
  royalties?: object;
  topBid?: object;
  rank?: object;
  volume?: object;
  volumeChange?: object;
  floorSale?: object;
  floorSaleChange?: object;
  ownerCount?: number;
}

export type CollectionWebsocketEventInfo = {
  before: CollectionInfo;
  after: CollectionInfo;
  trigger: "insert" | "update";
};
