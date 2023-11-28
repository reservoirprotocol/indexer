/* eslint-disable @typescript-eslint/no-explicit-any */

import _ from "lodash";
import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { logger } from "@/common/logger";
import { redb } from "@/common/db";
import { formatEth, fromBuffer, now, regex } from "@/common/utils";
import { CollectionSets } from "@/models/collection-sets";
import { Assets } from "@/utils/assets";
import { getUSDAndCurrencyPrices } from "@/utils/prices";
import { AddressZero } from "@ethersproject/constants";
import { getJoiCollectionObject, getJoiPriceObject, JoiPrice } from "@/common/joi";

const version = "v2";

export const getSearchCollectionsV2Options: RouteOptions = {
  cache: {
    privacy: "public",
    expiresIn: 10000,
  },
  description: "Search collections",
  tags: ["api", "Collections"],
  plugins: {
    "hapi-swagger": {
      order: 3,
    },
  },
  validate: {
    query: Joi.object({
      name: Joi.string()
        .lowercase()
        .description("Lightweight search for collections that match a string. Example: `bored`"),
      community: Joi.string()
        .lowercase()
        .description("Filter to a particular community. Example: `artblocks`"),
      displayCurrency: Joi.string()
        .lowercase()
        .pattern(regex.address)
        .description("Return result in given currency"),
      collectionsSetId: Joi.string()
        .lowercase()
        .description("Filter to a particular collection set"),
      excludeSpam: Joi.boolean()
        .default(false)
        .description("If true, will filter any collections marked as spam."),
      offset: Joi.number()
        .integer()
        .min(0)
        .default(0)
        .description("Use offset to request the next batch of items."),
      limit: Joi.number()
        .integer()
        .min(1)
        .max(1000)
        .default(20)
        .description("Amount of items returned in response."),
    }),
  },
  response: {
    schema: Joi.object({
      collections: Joi.array().items(
        Joi.object({
          collectionId: Joi.string(),
          contract: Joi.string(),
          image: Joi.string().allow("", null),
          name: Joi.string().allow("", null),
          isSpam: Joi.boolean().default(false),
          metadataDisabled: Joi.boolean().default(false),
          slug: Joi.string().allow("", null),
          allTimeVolume: Joi.number().unsafe().allow(null),
          floorAskPrice: JoiPrice.allow(null).description("Current floor ask price."),
          openseaVerificationStatus: Joi.string().allow("", null),
        })
      ),
    }).label(`getSearchCollections${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(`get-search-collections-${version}-handler`, `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    const query = request.query as any;
    let whereClause = "";
    const conditions: string[] = [`token_count > 0`];

    if (query.name) {
      query.name = `%${query.name}%`;
      conditions.push(`name ILIKE $/name/`);
    }

    if (query.community) {
      conditions.push(`c.community = $/community/`);
    }

    if (query.collectionsSetId) {
      const collectionsIds = await CollectionSets.getCollectionsIds(query.collectionsSetId);

      if (!_.isEmpty(collectionsIds)) {
        query.collectionsIds = _.join(collectionsIds, "','");
        conditions.push(`c.id IN ('$/collectionsIds:raw/')`);
      }
    }

    if (query.excludeSpam) {
      conditions.push("(c.is_spam IS NULL OR c.is_spam <= 0)");
    }

    if (conditions.length) {
      whereClause = " WHERE " + conditions.map((c) => `(${c})`).join(" AND ");
    }

    const baseQuery = `
            SELECT c.id, c.name, c.contract, (c.metadata ->> 'imageUrl')::TEXT AS image, c.all_time_volume, c.floor_sell_value,
                   c.slug, (c.metadata ->> 'safelistRequestStatus')::TEXT AS opensea_verification_status,
                   o.currency AS floor_sell_currency, c.is_spam, c.metadata_disabled,
                   o.currency_price AS floor_sell_currency_price
            FROM collections c
            LEFT JOIN orders o ON o.id = c.floor_sell_id
            ${whereClause}
            ORDER BY all_time_volume DESC
            OFFSET $/offset/
            LIMIT $/limit/`;

    const collections = await redb.manyOrNone(baseQuery, query);

    return {
      collections: await Promise.all(
        _.map(collections, async (collection) => {
          let allTimeVolume = collection.all_time_volume ? collection.all_time_volume : null;

          if (query.displayCurrency) {
            const currentTime = now();
            allTimeVolume = allTimeVolume
              ? (
                  await getUSDAndCurrencyPrices(
                    AddressZero,
                    query.displayCurrency,
                    allTimeVolume,
                    currentTime
                  )
                ).currencyPrice
              : null;
          }

          return getJoiCollectionObject(
            {
              collectionId: collection.id,
              name: collection.name,
              slug: collection.slug,
              contract: fromBuffer(collection.contract),
              image: Assets.getLocalAssetsLink(collection.image),
              isSpam: Number(collection.is_spam) > 0,
              metadataDisabled: Boolean(Number(collection.metadata_disabled)),
              allTimeVolume: allTimeVolume ? formatEth(allTimeVolume) : null,
              floorAskPrice: collection.floor_sell_value
                ? await getJoiPriceObject(
                    {
                      gross: {
                        amount: String(
                          collection.floor_sell_currency_price ?? collection.floor_sell_value
                        ),
                        nativeAmount: String(collection.floor_sell_value),
                      },
                    },
                    fromBuffer(collection.floor_sell_currency),
                    query.displayCurrency
                  )
                : undefined,
              openseaVerificationStatus: collection.opensea_verification_status,
            },
            collection.metadata_disabled
          );
        })
      ),
    };
  },
};
