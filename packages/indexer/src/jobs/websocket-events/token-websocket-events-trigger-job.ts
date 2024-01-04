import { logger } from "@/common/logger";
import { config } from "@/config/index";
import _ from "lodash";
import { publishWebsocketEvent } from "@/common/websocketPublisher";
import { idb } from "@/common/db";
import {
  getJoiCollectionObject,
  getJoiPriceObject,
  getJoiSourceObject,
  getJoiTokenObject,
} from "@/common/joi";
import { fromBuffer, toBuffer } from "@/common/utils";
import { Assets, ImageSize } from "@/utils/assets";
import * as Sdk from "@reservoir0x/sdk";
import { Sources } from "@/models/sources";
import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";

export type TokenWebsocketEventsTriggerJobPayload =
  | {
      kind?: "CDCEvent";
      data: TokenCDCEventInfo;
    }
  | {
      kind?: "ForcedChange";
      data: {
        contract: string;
        tokenId: string;
        changed: string[];
      };
    };

const changedMapping = {
  name: "name",
  is_spam: "is_spam",
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
  metadata_disabled: "metadataDisabled",
};

export class TokenWebsocketEventsTriggerJob extends AbstractRabbitMqJobHandler {
  queueName = "token-websocket-events-trigger-queue";
  maxRetries = 5;
  concurrency = 20;
  lazyMode = true;

  protected async process(payload: TokenWebsocketEventsTriggerJobPayload) {
    const { data, kind } = payload;

    if (kind === "ForcedChange") {
      await this.processForcedChange(data.contract, data.tokenId, data.changed);
    } else {
      await this.processCDCEvent(data as TokenCDCEventInfo);
    }
  }

  async processCDCEvent(data: TokenCDCEventInfo) {
    const contract = data.after.contract;
    const tokenId = data.after.token_id;

    try {
      const baseQuery = `
        SELECT
          con.kind,
          c.name AS collection_name,
          c.slug,
          c.metadata_disabled AS collection_metadata_disabled,
          (c.metadata ->> 'imageUrl')::TEXT AS collection_image,
          (SELECT
            array_agg(
              json_build_object(
                'key', ta.key,
                'kind', attributes.kind,
                'value', ta.value
              )
            )
          FROM token_attributes ta
          JOIN attributes
            ON ta.attribute_id = attributes.id
          WHERE ta.contract = $/contract/
            AND ta.token_id = $/tokenId/
            AND ta.key != ''
        ) AS attributes
        FROM contracts con
        LEFT JOIN collections c ON con.address = c.contract
        WHERE con.address = $/contract/
        ${data.after.collection_id ? "AND c.id = $/collectionId/" : ""}
        LIMIT 1
    `;

      const rawResult = await idb.manyOrNone(baseQuery, {
        contract: toBuffer(contract),
        tokenId,
        collectionId: data.after.collection_id,
      });

      const r = rawResult[0];

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
        token: getJoiTokenObject(
          {
            contract,
            tokenId,
            name: data.after.name,
            isSpam: Number(data.after.is_spam) > 0,
            description: data.after.description,
            image: Assets.getResizedImageUrl(data.after.image),
            media: data.after.media,
            kind: r?.kind,
            isFlagged: Boolean(Number(data.after.is_flagged)),
            metadataDisabled:
              Boolean(Number(data.after.metadata_disabled)) ||
              Boolean(Number(r?.collection_metadata_disabled)),
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
            collection: getJoiCollectionObject(
              {
                id: data.after.collection_id,
                name: r?.collection_name,
                image: r?.collection_image
                  ? Assets.getResizedImageUrl(r.collection_image, ImageSize.small)
                  : null,
                slug: r?.slug,
                metadataDisabled: Boolean(Number(r?.collection_metadata_disabled)),
              },
              r?.collection_metadata_disabled
            ),
            attributes: r?.attributes
              ? _.map(r.attributes, (attribute) => ({
                  key: attribute.key,
                  kind: attribute.kind,
                  value: attribute.value,
                }))
              : [],
          },
          Boolean(data.after.metadata_disabled),
          r?.collection_metadata_disabled
        ),
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

            source: getJoiSourceObject(floorSellSource),
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
            source: getJoiSourceObject(normalizedFloorSellSource),
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
            try {
              for (const key in data.after) {
                const beforeValue = data.before[key as keyof TokenInfo];
                const afterValue = data.after[key as keyof TokenInfo];

                if (beforeValue !== afterValue) {
                  changed.push(key as keyof TokenInfo);
                }
              }

              if (changed.length === 1) {
                logger.info(
                  this.queueName,
                  JSON.stringify({
                    topic: "debugTokenUpdate",
                    message: `No changes detected for token. contract=${contract}, tokenId=${tokenId}`,
                    changed,
                    changedJson: JSON.stringify(changed),
                    token: `${contract}:${tokenId}`,
                  })
                );
              }
            } catch (error) {
              logger.error(
                this.queueName,
                JSON.stringify({
                  message: `No changes detected for token error. contract=${contract}, tokenId=${tokenId}`,
                  data,
                  changed,
                  error,
                })
              );
            }

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
        this.queueName,
        JSON.stringify({
          topic: "processCDCEvent",
          message: `Error processing cdc event. contract=${contract}, tokenId=${tokenId}, error=${error}`,
          data,
          error,
        })
      );

      throw error;
    }
  }

  async processForcedChange(contract: string, tokenId: string, changed: string[]) {
    const eventType = "token.updated";

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

      const baseQuery = `
        SELECT
          t.contract,
          t.token_id,
          t.name,
          t.is_spam,
          t.description,
          t.image,
          t.image_version,
          (t.metadata ->> 'image_mime_type')::TEXT AS image_mime_type,
          (t.metadata ->> 'media_mime_type')::TEXT AS media_mime_type,
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
          t.created_at,
          t.updated_at,
          t.supply,
          t.remaining_supply,
          t.metadata_disabled AS token_metadata_disabled,
          c.metadata_disabled AS collection_metadata_disabled,
          c.slug,
          (c.metadata ->> 'imageUrl')::TEXT AS collection_image,
          (SELECT
            array_agg(
              json_build_object(
                'key', ta.key,
                'kind', attributes.kind,
                'value', ta.value
              )
            )
          FROM token_attributes ta
          JOIN attributes
            ON ta.attribute_id = attributes.id
          WHERE ta.contract = $/contract/
            AND ta.token_id = $/tokenId/
            AND ta.key != ''
        ) AS attributes
        FROM tokens t
        LEFT JOIN collections c ON t.collection_id = c.id
        JOIN contracts con ON t.contract = con.address
        WHERE t.contract = $/contract/ AND t.token_id = $/tokenId/
        LIMIT 1
      `;

      const rawResult = await idb.manyOrNone(baseQuery, {
        contract: toBuffer(contract),
        tokenId,
      });

      const r = rawResult[0];

      const sources = await Sources.getInstance();

      const floorSellSource = r.floor_sell_value
        ? sources.get(Number(r.floor_sell_source_id_int), contract, tokenId)
        : undefined;

      // Use default currencies for backwards compatibility with entries
      // that don't have the currencies cached in the tokens table
      const floorAskCurrency = r.floor_sell_currency
        ? fromBuffer(r.floor_sell_currency)
        : Sdk.Common.Addresses.Native[config.chainId];

      const normalizedFloorSellSource = r.normalized_floor_sell_value
        ? sources.get(Number(r.normalized_floor_sell_source_id_int), contract, tokenId)
        : undefined;

      // Use default currencies for backwards compatibility with entries
      // that don't have the currencies cached in the tokens table
      const normalizedFloorAskCurrency = r.normalized_floor_sell_currency
        ? fromBuffer(r.normalized_floor_sell_currency)
        : Sdk.Common.Addresses.Native[config.chainId];

      const result = {
        token: getJoiTokenObject(
          {
            contract,
            tokenId,
            name: r.name,
            isSpam: Number(r.is_spam) > 0,
            description: r.description,
            image: Assets.getResizedImageUrl(
              r.image,
              undefined,
              r.image_version,
              r.image_mime_type
            ),
            media: r.media,
            kind: r.kind,
            metadataDisabled:
              Boolean(Number(r.token_metadata_disabled)) ||
              Boolean(Number(r.collection_metadata_disabled)),
            isFlagged: Boolean(Number(r.is_flagged)),
            lastFlagUpdate: r.last_flag_update ? new Date(r.last_flag_update).toISOString() : null,
            lastFlagChange: r.last_flag_change ? new Date(r.last_flag_change).toISOString() : null,
            supply: !_.isNull(r.supply) ? r.supply : null,
            remainingSupply: !_.isNull(r.remaining_supply) ? r.remaining_supply : null,
            rarity: r.rarity_score,
            rarityRank: r.rarity_rank,
            collection: getJoiCollectionObject(
              {
                id: r.collection_id,
                name: r.collection_name,
                image: r?.collection_image
                  ? Assets.getResizedImageUrl(r.collection_image, ImageSize.small)
                  : null,
                slug: r.slug,
                metadataDisabled: Boolean(Number(r.collection_metadata_disabled)),
              },
              r.collection_metadata_disabled
            ),
            attributes: r?.attributes
              ? _.map(r.attributes, (attribute) => ({
                  key: attribute.key,
                  kind: attribute.kind,
                  value: attribute.value,
                }))
              : [],
          },
          r.token_metadata_disabled,
          r.collection_metadata_disabled
        ),
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
            maker: r.normalized_floor_sell_maker ? fromBuffer(r.normalized_floor_sell_maker) : null,
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
          createdAt: new Date(r.created_at).toISOString(),
          updatedAt: new Date(r.updated_at).toISOString(),
        },
      };

      await publishWebsocketEvent({
        event: eventType,
        tags: {
          contract: contract,
        },
        changed,
        data: result,
      });
    } catch (error) {
      logger.error(
        this.queueName,
        JSON.stringify({
          topic: "processForcedUpdate",
          message: `Error processing forced update event. contract=${contract}, tokenId=${tokenId}, error=${error}`,
          error,
        })
      );

      throw error;
    }
  }

  public async addToQueue(events: TokenWebsocketEventsTriggerJobPayload[]) {
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

export type TokenCDCEventInfo = {
  before: TokenInfo;
  after: TokenInfo;
  trigger: "insert" | "update" | "delete";
  offset: string;
};

interface TokenInfo {
  contract: string;
  token_id: string;
  name: string;
  is_spam: number;
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
  metadata_disabled?: number;
  supply: string;
  remaining_supply: string;
}

export const tokenWebsocketEventsTriggerJob = new TokenWebsocketEventsTriggerJob();
