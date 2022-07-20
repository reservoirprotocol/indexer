/* eslint-disable @typescript-eslint/no-explicit-any */

import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";
import _ from "lodash";

import { edb } from "@/common/db";
import { logger } from "@/common/logger";
import { config } from "@/config/index";
import * as collectionsRefreshCache from "@/jobs/collections-refresh/collections-refresh-cache";
import * as collectionUpdatesMetadata from "@/jobs/collection-updates/metadata-queue";
import * as metadataIndexFetch from "@/jobs/metadata-index/fetch-queue";
import * as orderFixes from "@/jobs/order-fixes/queue";
import { Collections } from "@/models/collections";
import { OpenseaIndexerApi } from "@/utils/opensea-indexer-api";

export const postRefreshCollectionOptions: RouteOptions = {
  description: "Refresh a collection's orders and metadata",
  tags: ["api", "x-admin"],
  validate: {
    headers: Joi.object({
      "x-admin-api-key": Joi.string().required(),
    }).options({ allowUnknown: true }),
    payload: Joi.object({
      collection: Joi.string()
        .lowercase()
        .description(
          "Refresh the given collection. Example: `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63`"
        )
        .required(),
    }),
  },
  handler: async (request: Request) => {
    if (request.headers["x-admin-api-key"] !== config.adminApiKey) {
      throw Boom.unauthorized("Wrong or missing admin API key");
    }

    const payload = request.payload as any;

    try {
      const collection = await Collections.getById(payload.collection);

      // If no collection found
      if (_.isNull(collection)) {
        throw Boom.badRequest(`Collection ${payload.collection} not found`);
      }

      // Update the last sync date
      const currentUtcTime = new Date().toISOString();
      await Collections.update(payload.collection, { lastMetadataSync: currentUtcTime });

      // Update the collection id of any missing tokens
      await edb.none(
        `
          WITH x AS (
            SELECT
              collections.contract,
              collections.token_id_range
            FROM collections
            WHERE collections.id = $/collection/
          )
          UPDATE tokens SET
            collection_id = $/collection/,
            updated_at = now()
          FROM x
          WHERE tokens.contract = x.contract
            AND tokens.token_id <@ x.token_id_range
            AND tokens.collection_id IS NULL
        `,
        { collection: payload.collection }
      );

      // Refresh the collection metadata
      const tokenId = _.isEmpty(collection.tokenIdRange) ? "1" : `${collection.tokenIdRange[0]}`;
      await collectionUpdatesMetadata.addToQueue(collection.contract, tokenId);

      // Refresh the contract floor sell and top bid
      await collectionsRefreshCache.addToQueue(collection.contract);

      // Revalidate the contract orders
      await orderFixes.addToQueue([{ by: "contract", data: { contract: collection.contract } }]);

      // Refresh contract orders from OpenSea
      await OpenseaIndexerApi.fastContractSync(collection.contract);

      // Refresh the collection tokens metadata
      await metadataIndexFetch.addToQueue(
        [
          {
            kind: "full-collection",
            data: {
              method: config.metadataIndexingMethod,
              collection: collection.id,
            },
          },
        ],
        true
      );

      return { message: "Request accepted" };
    } catch (error) {
      logger.error(`post-collections-refresh-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
