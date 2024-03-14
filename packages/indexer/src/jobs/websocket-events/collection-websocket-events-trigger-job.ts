import { logger } from "@/common/logger";
import { config } from "@/config/index";
import { publishWebsocketEvent } from "@/common/websocketPublisher";
import { formatEth, fromBuffer, toBuffer } from "@/common/utils";
import { Assets, ImageSize } from "@/utils/assets";
import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";
import { idb } from "@/common/db";
import { redis } from "@/common/redis";
import { Sources } from "@/models/sources";
import { formatValidBetween } from "@/jobs/websocket-events/utils";
import { getJoiPriceObject } from "@/common/joi";
import * as Sdk from "@reservoir0x/sdk";

interface CollectionInfo {
  id: string;
  slug: string;
  name: string;
  is_spam: number;
  metadata: string;
  image_version: number;
  royalties: string;
  contract: string;
  token_set_id: string;
  day1_rank: number;
  day1_volume: number;
  day7_rank: number;
  day7_volume: number;
  day30_rank: number;
  day30_volume: number;
  all_time_rank: number;
  all_time_volume: number;
  day1_volume_change: number;
  day7_volume_change: number;
  day30_volume_change: number;
  day1_floor_sell_value: string;
  day7_floor_sell_value: string;
  day30_floor_sell_value: string;
  token_count: number;
  owner_count: number;
  floor_sell_id: string;
  floor_sell_value: string;
  floor_sell_maker: string;
  floor_sell_valid_between: string;
  floor_sell_source_id_int: number;
  normalized_floor_sell_id: string;
  normalized_floor_sell_value: string;
  normalized_floor_sell_maker: string;
  normalized_floor_sell_valid_between: string;
  normalized_floor_sell_source_id_int: number;
  non_flagged_floor_sell_id: string;
  non_flagged_floor_sell_value: string;
  non_flagged_floor_sell_maker: string;
  non_flagged_floor_sell_valid_between: string;
  non_flagged_floor_sell_source_id_int: number;
  top_buy_id: string;
  top_buy_value: string;
  top_buy_maker: string;
  top_buy_valid_between: string;
  top_buy_source_id_int: number;
  metadata_disabled?: number;
  created_at: string;
  updated_at: string;
  on_sale_count: number;
}

export type CollectionWebsocketEventInfo = {
  before: CollectionInfo;
  after: CollectionInfo;
  trigger: "insert" | "update";
};

const changedMapping = {
  slug: "slug",
  name: "name",
  is_spam: "is_spam",
  metadata: "metadata",
  royalties: "royalties",
  token_set_id: "tokenSetId",
  day1_rank: "rank.1day",
  day7_rank: "rank.7day",
  day30_rank: "rank.30day",
  all_time_rank: "rank.allTime",
  day1_volume: "volume.1day",
  day7_volume: "volume.7day",
  day30_volume: "volume.30day",
  all_time_volume: "volume.allTime",
  day1_volume_change: "volumeChange.1day",
  day7_volume_change: "volumeChange.7day",
  day30_volume_change: "volumeChange.30day",
  day1_floor_sell_value: "floorSale.1day",
  day7_floor_sell_value: "floorSale.7day",
  day30_floor_sell_value: "floorSale.30day",
  token_count: "tokenCount",
  owner_count: "ownerCount",
  floor_sell_id: "floorAsk.id",
  floor_sell_value: "floorAsk.price",
  normalized_floor_sell_id: "floorAskNormalized.id",
  normalized_floor_sell_value: "floorAskNormalized.price",
  non_flagged_floor_sell_id: "floorAskNonFlagged.id",
  non_flagged_floor_sell_value: "floorAskNonFlagged.price",
  top_buy_id: "topBid.id",
  top_buy_value: "topBid.value",
  metadata_disabled: "metadataDisabled",
  on_sale_count: "onSaleCount",
};

export type CollectionWebsocketEventsTriggerQueuePayload = {
  data: CollectionWebsocketEventInfo;
};

export class CollectionWebsocketEventsTriggerQueueJob extends AbstractRabbitMqJobHandler {
  queueName = "collection-websocket-events-trigger-queue";
  maxRetries = 5;
  concurrency = 10;
  timeout = 60000;
  backoff = {
    type: "exponential",
    delay: 1000,
  } as BackoffStrategy;

  public async process(payload: CollectionWebsocketEventsTriggerQueuePayload) {
    const { data } = payload;

    try {
      let contractKind = await redis.get(`contract-kind:${data.after.contract}`);

      if (!contractKind) {
        const result = await idb.oneOrNone(
          `
          SELECT
            con.kind
          FROM contracts con
          WHERE con.address = $/contract/
        `,
          {
            contract: toBuffer(data.after.contract),
          }
        );

        contractKind = result?.kind;

        if (contractKind) {
          await redis.set(`contract-kind:${data.after.contract}`, contractKind, "EX", 86400);
        }
      }

      let eventType = "";
      const changed = [];
      if (data.trigger === "insert") eventType = "collection.created";
      else if (data.trigger === "update") {
        eventType = "collection.updated";
        if (data.before) {
          for (const key in changedMapping) {
            if (
              data.before[key as keyof CollectionInfo] !== data.after[key as keyof CollectionInfo]
            ) {
              changed.push(changedMapping[key as keyof typeof changedMapping]);
            }
          }
        }

        if (!changed.length) {
          try {
            for (const key in data.after) {
              const beforeValue = data.before[key as keyof CollectionInfo];
              const afterValue = data.after[key as keyof CollectionInfo];

              if (beforeValue !== afterValue) {
                changed.push(key as keyof CollectionInfo);
              }
            }

            if (changed.length === 1) {
              logger.info(
                this.queueName,
                JSON.stringify({
                  topic: "debugCollectionUpdates",
                  message: `No changes detected for collection. contract=${data.after.contract}, collectionId=${data.after.id}`,
                  changed,
                  changedJson: JSON.stringify(changed),
                  collectionId: data.after.id,
                })
              );
            }
          } catch (error) {
            logger.error(
              this.queueName,
              JSON.stringify({
                message: `No changes detected for collection error. contract=${data.after.contract}, collectionId=${data.after.id}`,
                data,
                changed,
                error,
              })
            );
          }

          return;
        }
      }

      const r = data.after;
      const metadata = JSON.parse(r.metadata);
      const sources = await Sources.getInstance();

      const top_buy_source = r.top_buy_id ? sources.get(r.top_buy_source_id_int) : null;
      const floor_sell_source = r.floor_sell_id ? sources.get(r.floor_sell_source_id_int) : null;
      const normalized_floor_sell_source = r.normalized_floor_sell_id
        ? sources.get(r.normalized_floor_sell_source_id_int)
        : null;
      const non_flagged_floor_sell_source = r.non_flagged_floor_sell_id
        ? sources.get(r.non_flagged_floor_sell_source_id_int)
        : null;

      const metadataDisabled = r.metadata_disabled;
      const id = !metadataDisabled ? r.id : r.contract;

      if (changed.includes("metadata")) {
        const beforeMetadata = JSON.parse(data.before.metadata);

        if (beforeMetadata.safelistRequestStatus !== metadata.safelistRequestStatus) {
          changed.push("openseaVerificationStatus");
        }

        if (beforeMetadata.magicedenVerificationStatus !== metadata.magicedenVerificationStatus) {
          changed.push("magicedenVerificationStatus");
        }

        if (!metadataDisabled) {
          if (beforeMetadata.imageUrl !== metadata.imageUrl) {
            changed.push("imageUrl");
          }

          if (beforeMetadata.bannerImageUrl !== metadata.bannerImageUrl) {
            changed.push("bannerImageUrl");
          }

          if (beforeMetadata.discordUrl !== metadata.discordUrl) {
            changed.push("discordUrl");
          }

          if (beforeMetadata.externalUrl !== metadata.externalUrl) {
            changed.push("externalUrl");
          }

          if (beforeMetadata.twitterUsername !== metadata.twitterUsername) {
            changed.push("twitterUsername");
          }

          if (beforeMetadata.description !== metadata.description) {
            changed.push("description");
          }
        }
      }

      let floorAskCurrency;
      let floorAskCurrencyValue;

      let floorAskNormalizedCurrency;
      let floorAskNormalizedCurrencyValue;

      let floorAskNonFlaggedCurrency;
      let floorAskNonFlaggedCurrencyValue;

      let topBidCurrency;
      let topBidCurrencyValue;

      try {
        let orderIds = [
          r.floor_sell_id,
          r.normalized_floor_sell_id,
          r.non_flagged_floor_sell_id,
          r.top_buy_id,
        ];

        orderIds = orderIds.filter(Boolean);
        orderIds = [...new Set(orderIds)];

        if (orderIds.length) {
          const orders = await idb.manyOrNone(
            `
          SELECT
            id,
            currency,
            currency_value
          FROM orders
          WHERE id IN ($/orderIds:list/)
        `,
            {
              orderIds,
            }
          );

          const floorAsk = orders.find((order) => order.id === r.floor_sell_id);

          if (floorAsk) {
            floorAskCurrency = floorAsk.currency
              ? fromBuffer(floorAsk.currency)
              : Sdk.Common.Addresses.Native[config.chainId];
            floorAskCurrencyValue = floorAsk.currency_value;
          }

          const floorAskNormalized = orders.find(
            (order) => order.id === r.normalized_floor_sell_id
          );

          if (floorAskNormalized) {
            floorAskNormalizedCurrency = floorAskNormalized.currency
              ? fromBuffer(floorAskNormalized.currency)
              : Sdk.Common.Addresses.Native[config.chainId];
            floorAskNormalizedCurrencyValue = floorAskNormalized.currency_value;
          }

          const floorAskNonFlagged = orders.find(
            (order) => order.id === r.non_flagged_floor_sell_id
          );

          if (floorAskNonFlagged) {
            floorAskNonFlaggedCurrency = floorAskNonFlagged.currency
              ? fromBuffer(floorAskNonFlagged.currency)
              : Sdk.Common.Addresses.Native[config.chainId];
            floorAskNonFlaggedCurrencyValue = floorAskNonFlagged.currency_value;
          }

          const topBid = orders.find((order) => order.id === r.top_buy_id);

          if (topBid) {
            topBidCurrency = topBid.currency
              ? fromBuffer(topBid.currency)
              : Sdk.Common.Addresses.Native[config.chainId];
            topBidCurrencyValue = topBid.currency_value;
          }
        }

        logger.info(
          this.queueName,
          JSON.stringify({
            message: `fetching floor ask currency. contract=${data.after.contract}, collectionId=${data.after.id}`,
            orderIds,
            floorAskCurrency,
            floorAskCurrencyValue,
            floorAskNormalizedCurrency,
            floorAskNormalizedCurrencyValue,
            floorAskNonFlaggedCurrency,
            floorAskNonFlaggedCurrencyValue,
            topBidCurrency,
            topBidCurrencyValue,
          })
        );
      } catch (error) {
        logger.error(
          this.queueName,
          JSON.stringify({
            message: `Error fetching floor ask currency. contract=${data.after.contract}, collectionId=${data.after.id}, error=${error}`,
            data: JSON.stringify(data),
            error,
          })
        );
      }

      await publishWebsocketEvent({
        event: eventType,
        tags: {
          id,
        },
        changed,
        data: {
          id,
          slug: !metadataDisabled ? r.slug : r.contract,
          name: !metadataDisabled ? r.name : r.contract,
          isSpam: Number(r.is_spam) > 0,
          metadata: {
            imageUrl: !metadataDisabled
              ? Assets.getResizedImageUrl(metadata?.imageUrl, ImageSize.small, r?.image_version)
              : null,
            bannerImageUrl: !metadataDisabled ? metadata?.bannerImageUrl : null,
            discordUrl: !metadataDisabled ? metadata?.discordUrl : null,
            externalUrl: !metadataDisabled ? metadata?.externalUrl : null,
            twitterUsername: !metadataDisabled ? metadata?.twitterUsername : null,
            description: !metadataDisabled ? metadata?.description : null,
          },
          metadataDisabled: Boolean(Number(metadataDisabled)),
          tokenCount: String(r.token_count),
          primaryContract: r.contract,
          tokenSetId: !metadataDisabled ? r.token_set_id : `contract:${r.contract}`,
          contractKind,
          openseaVerificationStatus: metadata?.safelistRequestStatus ?? null,
          magicedenVerificationStatus: metadata?.magicedenVerificationStatus ?? null,
          royalties: !metadataDisabled && r.royalties ? JSON.parse(r.royalties)[0] : null,
          topBid: {
            id: r.top_buy_id,
            value: r.top_buy_value ? formatEth(r.top_buy_value) : null,
            price: r.top_buy_id
              ? await getJoiPriceObject(
                  {
                    gross: {
                      amount: topBidCurrencyValue ?? r.top_buy_value,
                      nativeAmount: r.top_buy_value,
                    },
                  },
                  topBidCurrency,
                  undefined
                )
              : null,
            maker: r.top_buy_maker ? r.top_buy_maker : null,
            ...formatValidBetween(r.top_buy_valid_between),
            source: top_buy_source
              ? {
                  id: top_buy_source.address,
                  domain: top_buy_source.domain,
                  name: top_buy_source.getTitle(),
                  icon: top_buy_source.getIcon(),
                  url: top_buy_source.metadata.url,
                }
              : null,
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
            priceV2: r.floor_sell_id
              ? await getJoiPriceObject(
                  {
                    gross: {
                      amount: floorAskCurrencyValue ?? r.floor_sell_value,
                      nativeAmount: r.floor_sell_value,
                    },
                  },
                  floorAskCurrency,
                  undefined
                )
              : null,
            maker: r.floor_sell_id ? r.floor_sell_maker : null,
            ...formatValidBetween(r.floor_sell_valid_between),
            source: floor_sell_source
              ? {
                  id: floor_sell_source.address,
                  domain: floor_sell_source.domain,
                  name: floor_sell_source.getTitle(),
                  icon: floor_sell_source.getIcon(),
                  url: floor_sell_source.metadata.url,
                }
              : null,
          },
          floorAskNormalized: {
            id: r.normalized_floor_sell_id,
            price: r.normalized_floor_sell_id ? formatEth(r.normalized_floor_sell_value) : null,
            priceV2: r.normalized_floor_sell_id
              ? await getJoiPriceObject(
                  {
                    gross: {
                      amount: floorAskNormalizedCurrencyValue ?? r.normalized_floor_sell_value,
                      nativeAmount: r.normalized_floor_sell_value,
                    },
                  },
                  floorAskNormalizedCurrency,
                  undefined
                )
              : null,
            maker: r.normalized_floor_sell_id ? r.normalized_floor_sell_maker : null,
            ...formatValidBetween(r.normalized_floor_sell_valid_between),
            source: normalized_floor_sell_source
              ? {
                  id: normalized_floor_sell_source.address,
                  domain: normalized_floor_sell_source.domain,
                  name: normalized_floor_sell_source.getTitle(),
                  icon: normalized_floor_sell_source.getIcon(),
                  url: normalized_floor_sell_source.metadata.url,
                }
              : null,
          },
          floorAskNonFlagged: {
            id: r.non_flagged_floor_sell_id,
            price: r.non_flagged_floor_sell_id ? formatEth(r.non_flagged_floor_sell_value) : null,
            priceV2: r.non_flagged_floor_sell_id
              ? await getJoiPriceObject(
                  {
                    gross: {
                      amount: floorAskNonFlaggedCurrencyValue ?? r.non_flagged_floor_sell_id,
                      nativeAmount: r.non_flagged_floor_sell_id,
                    },
                  },
                  floorAskNonFlaggedCurrency,
                  undefined
                )
              : null,
            maker: r.non_flagged_floor_sell_id ? r.non_flagged_floor_sell_maker : null,
            ...formatValidBetween(r.non_flagged_floor_sell_valid_between),
            source: non_flagged_floor_sell_source
              ? {
                  id: non_flagged_floor_sell_source.address,
                  domain: non_flagged_floor_sell_source.domain,
                  name: non_flagged_floor_sell_source.getTitle(),
                  icon: non_flagged_floor_sell_source.getIcon(),
                  url: non_flagged_floor_sell_source.metadata.url,
                }
              : null,
          },
          createdAt: new Date(data.after.created_at).toISOString(),
          updatedAt: new Date(data.after.updated_at).toISOString(),
          onSaleCount: String(data.after.on_sale_count),
        },
      });
    } catch (error) {
      logger.error(
        this.queueName,
        `Error processing websocket event. data=${JSON.stringify(data)}, error=${JSON.stringify(
          error
        )}`
      );
      throw error;
    }
  }

  public async addToQueue(events: CollectionWebsocketEventsTriggerQueuePayload[]) {
    if (!config.doWebsocketServerWork) {
      return;
    }

    await this.sendBatch(
      events.map((event) => ({
        payload: event,
      }))
    );
  }
}

export const collectionWebsocketEventsTriggerQueueJob =
  new CollectionWebsocketEventsTriggerQueueJob();
