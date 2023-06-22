import { idb, pgp, PgPromiseQuery } from "@/common/db";
import { toBuffer } from "@/common/utils";
import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";
import { logger } from "@/common/logger";
import MetadataApi from "@/utils/metadata-api";
import _ from "lodash";
import { recalcTokenCountQueueJob } from "@/jobs/collection-updates/recalc-token-count-queue-job";
import { recalcOwnerCountQueueJob } from "@/jobs/collection-updates/recalc-owner-count-queue-job";
import * as collectionUpdatesFloorAsk from "@/jobs/collection-updates/floor-queue";
import * as collectionUpdatesNormalizedFloorAsk from "@/jobs/collection-updates/normalized-floor-queue";
import { config } from "@/config/index";
import * as metadataIndexFetch from "@/jobs/metadata-index/fetch-queue";
import { getNetworkSettings } from "@/config/network";
import * as royalties from "@/utils/royalties";
import * as marketplaceFees from "@/utils/marketplace-fees";
import { nonFlaggedFloorQueueJob } from "@/jobs/collection-updates/non-flagged-floor-queue-job";

export type FetchCollectionMetadataJobPayload = {
  contract: string;
  tokenId: string;
  mintedTimestamp?: number;
  newCollection?: boolean;
  oldCollectionId?: string;
  allowFallbackCollectionMetadata?: boolean;
  context?: string;
};

export class FetchCollectionMetadataJob extends AbstractRabbitMqJobHandler {
  queueName = "token-updates-fetch-collection-metadata-queue";
  maxRetries = 10;
  concurrency = 5;
  backoff = {
    type: "exponential",
    delay: 20000,
  } as BackoffStrategy;

  protected async process(payload: FetchCollectionMetadataJobPayload) {
    const { contract, tokenId, mintedTimestamp, newCollection, oldCollectionId } = payload;

    try {
      // Fetch collection metadata
      const collection = await MetadataApi.getCollectionMetadata(contract, tokenId, "", {
        allowFallback: !newCollection,
      });

      let tokenIdRange: string | null = null;
      if (collection.tokenIdRange) {
        tokenIdRange = `numrange(${collection.tokenIdRange[0]}, ${collection.tokenIdRange[1]}, '[]')`;
      } else if (collection.id === contract) {
        tokenIdRange = `'(,)'::numrange`;
      }

      // For covering the case where the token id range is null
      const tokenIdRangeParam = tokenIdRange ? "$/tokenIdRange:raw/" : "$/tokenIdRange/";

      const queries: PgPromiseQuery[] = [];
      queries.push({
        query: `
            INSERT INTO "collections" (
              "id",
              "slug",
              "name",
              "community",
              "metadata",
              "contract",
              "token_id_range",
              "token_set_id",
              "minted_timestamp",
              "payment_tokens"
            ) VALUES (
              $/id/,
              $/slug/,
              $/name/,
              $/community/,
              $/metadata:json/,
              $/contract/,
              ${tokenIdRangeParam},
              $/tokenSetId/,
              $/mintedTimestamp/,
              $/paymentTokens/
            ) ON CONFLICT DO NOTHING;
          `,
        values: {
          id: collection.id,
          slug: collection.slug,
          name: collection.name,
          community: collection.community,
          metadata: collection.metadata,
          contract: toBuffer(collection.contract),
          tokenIdRange,
          tokenSetId: collection.tokenSetId,
          mintedTimestamp: mintedTimestamp ?? null,
          paymentTokens: collection.paymentTokens ? { opensea: collection.paymentTokens } : {},
        },
      });

      let tokenFilter = `AND "token_id" <@ ${tokenIdRangeParam}`;
      if (newCollection || _.isNull(tokenIdRange)) {
        tokenFilter = `AND "token_id" = $/tokenId/`;
      }

      // Since this is the first time we run into this collection,
      // we update all tokens that match its token definition
      queries.push({
        query: `
                UPDATE "tokens"
                SET "collection_id" = $/collection/,
                    "updated_at" = now()
                WHERE "contract" = $/contract/
                ${tokenFilter}
            `,
        values: {
          contract: toBuffer(collection.contract),
          tokenIdRange,
          tokenId,
          collection: collection.id,
        },
      });

      // Write the collection to the database
      await idb.none(pgp.helpers.concat(queries));

      // Schedule a job to re-count tokens in the collection
      await recalcTokenCountQueueJob.addToQueue({ collection: collection.id });
      await recalcOwnerCountQueueJob.addToQueue([
        { context: this.queueName, kind: "collectionId", data: { collectionId: collection.id } },
      ]);

      // If token has moved collections, update the old collection's token count
      if (oldCollectionId) {
        await recalcTokenCountQueueJob.addToQueue({
          collection: oldCollectionId,
          force: true,
        });
      }

      // If this is a new collection, recalculate floor price
      if (collection?.id && newCollection) {
        const floorAskInfo = {
          kind: "revalidation",
          contract,
          tokenId,
          txHash: null,
          txTimestamp: null,
        };

        await Promise.all([
          collectionUpdatesFloorAsk.addToQueue([floorAskInfo]),
          nonFlaggedFloorQueueJob.addToQueue([floorAskInfo]),
          collectionUpdatesNormalizedFloorAsk.addToQueue([floorAskInfo]),
        ]);
      }

      if (collection?.id && !config.disableRealtimeMetadataRefresh) {
        await metadataIndexFetch.addToQueue(
          [
            {
              kind: "single-token",
              data: {
                method: metadataIndexFetch.getIndexingMethod(collection.community),
                contract,
                tokenId,
                collection: collection.id,
              },
            },
          ],
          true,
          getNetworkSettings().metadataMintDelay
        );
      }

      // Refresh all royalty specs and the default royalties
      await royalties.refreshAllRoyaltySpecs(
        collection.id,
        collection.royalties as royalties.Royalty[] | undefined,
        collection.openseaRoyalties as royalties.Royalty[] | undefined
      );
      await royalties.refreshDefaultRoyalties(collection.id);

      // Refresh marketplace fees
      await marketplaceFees.updateMarketplaceFeeSpec(
        collection.id,
        "opensea",
        collection.openseaFees as royalties.Royalty[] | undefined
      );
    } catch (error) {
      logger.error(
        this.queueName,
        `Failed to fetch collection metadata ${JSON.stringify(payload)}: ${error}`
      );
      throw error;
    }
  }

  public async addToQueue(infos: FetchCollectionMetadataJobPayload[], jobId = "") {
    await this.sendBatch(
      infos.map((info) => {
        if (jobId === "") {
          // For contracts with multiple collections, we have to include the token in order the fetch the right collection
          jobId = getNetworkSettings().multiCollectionContracts.includes(info.contract)
            ? `${info.contract}-${info.tokenId}`
            : info.contract;
        }

        info.allowFallbackCollectionMetadata = info.allowFallbackCollectionMetadata ?? true;

        return {
          payload: info,
          jobId,
        };
      })
    );
  }
}

export const fetchCollectionMetadataJob = new FetchCollectionMetadataJob();
