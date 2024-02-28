/* eslint-disable @typescript-eslint/no-explicit-any */

import _ from "lodash";
import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { logger } from "@/common/logger";
import { regex } from "@/common/utils";
import { Assets, ImageSize } from "@/utils/assets";
import { getJoiCollectionObject, getJoiPriceObject, JoiPrice } from "@/common/joi";
import * as collectionsIndex from "@/elasticsearch/indexes/collections";
import * as Sdk from "@reservoir0x/sdk";
import { config } from "@/config/index";
import { CollectionSets } from "@/models/collection-sets";

const version = "v3";

export const getSearchCollectionsV3Options: RouteOptions = {
  description: "Search Collections",
  tags: ["api", "x-deprecated"],
  plugins: {
    "hapi-swagger": {
      order: 3,
    },
  },
  validate: {
    headers: Joi.object({
      "x-debug": Joi.string(),
    }).options({ allowUnknown: true }),
    query: Joi.object({
      prefix: Joi.string()
        .lowercase()
        .description(
          "Lightweight search for collections that match a string. Can also search using contract address. Example: `bored` or `0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d`"
        ),
      displayCurrency: Joi.string()
        .lowercase()
        .pattern(regex.address)
        .description("Return result in given currency"),
      excludeSpam: Joi.boolean()
        .default(false)
        .description("If true, will filter any collections marked as spam."),
      fuzzy: Joi.boolean()
        .default(false)
        .description("If true, fuzzy search to help with misspellings."),
      limit: Joi.number()
        .integer()
        .min(1)
        .max(100)
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
            isNsfw: Joi.boolean().default(false),
            slug: Joi.string().allow("", null),
            rank: Joi.object({
              "1day": Joi.number().unsafe().allow(null),
              "7day": Joi.number().unsafe().allow(null),
              "30day": Joi.number().unsafe().allow(null),
              allTime: Joi.number().unsafe().allow(null),
            }).description("Current rank based from overall volume"),
            volume: Joi.object({
              "1day": JoiPrice.allow(null),
              "7day": JoiPrice.allow(null),
              "30day": JoiPrice.allow(null),
              allTime: JoiPrice.allow(null),
            }).description("Total volume in given time period."),
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
    const debug = request.headers["x-debug"] ?? false;

    let collectionIds: string[] = [];

    if (query.collectionsSetId) {
      collectionIds = await CollectionSets.getCollectionsIds(query.collectionsSetId);

      if (_.isEmpty(collectionIds)) {
        return [];
      }
    }

    let results = [];

    if (debug) {
      results = (
        await collectionsIndex.autocompleteV2({
          prefix: query.prefix,
          collectionIds: collectionIds,
          communities: query.community ? [query.community] : undefined,
          excludeSpam: query.excludeSpam,
          excludeNsfw: query.excludeNsfw,
          fuzzy: query.fuzzy,
          limit: query.limit,
        })
      ).results;
    } else {
      results = (
        await collectionsIndex.autocomplete({
          prefix: query.prefix,
          collectionIds: collectionIds,
          communities: query.community ? [query.community] : undefined,
          excludeSpam: query.excludeSpam,
          excludeNsfw: query.excludeNsfw,
          fuzzy: query.fuzzy,
          limit: query.limit,
        })
      ).results;
    }

    return {
      collections: await Promise.all(
        _.map(results, async ({ collection, score }) => {
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
                isSpam: collection.isSpam,
                isNsfw: collection.isNsfw,
                rank: {
                  "1day": collection.day1Rank,
                  "7day": collection.day7Rank,
                  "30day": collection.day30Rank,
                  allTime: collection.allTimeRank,
                },
                volume: {
                  "1day": collection.day1Volume
                    ? await getJoiPriceObject(
                        {
                          gross: {
                            amount: String(collection.day1Volume),
                            nativeAmount: String(collection.day1Volume),
                          },
                        },
                        Sdk.Common.Addresses.Native[config.chainId],
                        query.displayCurrency
                      )
                    : null,
                  "7day": collection.day7Volume
                    ? await getJoiPriceObject(
                        {
                          gross: {
                            amount: String(collection.day7Volume),
                            nativeAmount: String(collection.day7Volume),
                          },
                        },
                        Sdk.Common.Addresses.Native[config.chainId],
                        query.displayCurrency
                      )
                    : null,
                  "30day": collection.day30Volume
                    ? await getJoiPriceObject(
                        {
                          gross: {
                            amount: String(collection.day30Volume),
                            nativeAmount: String(collection.day30Volume),
                          },
                        },
                        Sdk.Common.Addresses.Native[config.chainId],
                        query.displayCurrency
                      )
                    : null,
                  allTime: collection.allTimeVolume
                    ? await getJoiPriceObject(
                        {
                          gross: {
                            amount: String(collection.allTimeVolume),
                            nativeAmount: String(collection.allTimeVolume),
                          },
                        },
                        Sdk.Common.Addresses.Native[config.chainId],
                        query.displayCurrency
                      )
                    : null,
                },
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
