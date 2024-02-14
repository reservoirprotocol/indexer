/* eslint-disable @typescript-eslint/no-explicit-any */

import _ from "lodash";
import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { logger } from "@/common/logger";
import { formatEth, now, regex } from "@/common/utils";
import { Assets, ImageSize } from "@/utils/assets";
import { getUSDAndCurrencyPrices } from "@/utils/prices";
import { AddressZero } from "@ethersproject/constants";
import { getJoiCollectionObject, getJoiPriceObject, JoiPrice } from "@/common/joi";
import * as collectionsIndex from "@/elasticsearch/indexes/collections";

const version = "v3";

export const getSearchCollectionsV3Options: RouteOptions = {
  cache: {
    privacy: "public",
    expiresIn: 10000,
  },
  description: "Search Collections",
  tags: ["api", "x-deprecated"],
  plugins: {
    "hapi-swagger": {
      order: 3,
    },
  },
  validate: {
    query: Joi.object({
      prefix: Joi.string()
        .lowercase()
        .description(
          "Lightweight search for collections that match a string. Can also search using contract address. Example: `bored` or `0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d`"
        ),
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
      excludeNsfw: Joi.boolean()
        .default(false)
        .description("If true, will filter any collections marked as nsfw."),
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
          collection: Joi.object({
            id: Joi.string(),
            contract: Joi.string(),
            image: Joi.string().allow("", null),
            name: Joi.string().allow("", null),
            isSpam: Joi.boolean().default(false),
            slug: Joi.string().allow("", null),
            allTimeVolume: Joi.number().unsafe().allow(null),
            floorAskPrice: JoiPrice.allow(null).description("Current floor ask price."),
            openseaVerificationStatus: Joi.string().allow("", null),
          }),
          score: Joi.number().unsafe().allow(null),
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

    // if (query.collectionsSetId) {
    //   const collectionsIds = await CollectionSets.getCollectionsIds(query.collectionsSetId);
    //
    //   if (!_.isEmpty(collectionsIds)) {
    //     query.collectionsIds = _.join(collectionsIds, "','");
    //     conditions.push(`c.id IN ('$/collectionsIds:raw/')`);
    //   }
    // }

    const { results } = await collectionsIndex.autocomplete({
      prefix: query.prefix,
      communities: query.community ? [query.community] : undefined,
      excludeSpam: query.excludeSpam,
      excludeNsfw: query.excludeNsfw,
      limit: query.limit,
    });

    return {
      collections: await Promise.all(
        _.map(results, async ({ collection, score }) => {
          let allTimeVolume;

          if (query.displayCurrency) {
            const currentTime = now();

            allTimeVolume = collection.allTimeVolume
              ? (
                  await getUSDAndCurrencyPrices(
                    AddressZero,
                    query.displayCurrency,
                    collection.allTimeVolume,
                    currentTime
                  )
                ).currencyPrice
              : null;
          } else {
            allTimeVolume = collection.allTimeVolume;
          }

          return {
            collection: getJoiCollectionObject(
              {
                id: collection.id,
                name: collection.name,
                slug: collection.slug,
                contract: collection.contract,
                image: Assets.getResizedImageUrl(
                  collection.image,
                  ImageSize.small,
                  collection.imageVersion
                ),
                isSpam: Number(collection.isSpam) > 0,
                allTimeVolume: allTimeVolume ? formatEth(allTimeVolume) : null,
                floorAskPrice: collection.floorSell?.value
                  ? await getJoiPriceObject(
                      {
                        gross: {
                          amount: String(
                            collection.floorSell.currencyPrice ?? collection.floorSell.value
                          ),
                          nativeAmount: String(collection.floorSell.value),
                        },
                      },
                      collection.floorSell.currency!,
                      query.displayCurrency
                    )
                  : undefined,
                openseaVerificationStatus: collection.openseaVerificationStatus,
              },
              collection.metadataDisabled
            ),
            score,
          };
        })
      ),
    };
  },
};
