import { idb, pgp, PgPromiseQuery } from "@/common/db";
import { toBuffer } from "@/common/utils";
import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";
import { logger } from "@/common/logger";
import MetadataProviderRouter from "@/metadata/metadata-provider-router";
import _ from "lodash";
import { recalcTokenCountQueueJob } from "@/jobs/collection-updates/recalc-token-count-queue-job";
import { recalcOwnerCountQueueJob } from "@/jobs/collection-updates/recalc-owner-count-queue-job";
import { config } from "@/config/index";
import { getNetworkSettings } from "@/config/network";
import * as royalties from "@/utils/royalties";
import * as marketplaceFees from "@/utils/marketplace-fees";
import { metadataIndexFetchJob } from "@/jobs/metadata-index/metadata-fetch-job";

export type FetchCollectionMetadataJobPayload = {
  contract: string;
  tokenId: string;
  mintedTimestamp?: number;
  allowFallbackCollectionMetadata?: boolean;
  context?: string;
};

export default class FetchCollectionMetadataJob extends AbstractRabbitMqJobHandler {
  queueName = "token-updates-fetch-collection-metadata-queue";
  maxRetries = 10;
  concurrency = 5;
  backoff = {
    type: "exponential",
    delay: 20000,
  } as BackoffStrategy;

  protected async process(payload: FetchCollectionMetadataJobPayload) {
    const { contract, tokenId, mintedTimestamp } = payload;

    console.log("payload", payload)

    try {
      // Fetch collection metadata
      let collection = await MetadataProviderRouter.getCollectionMetadata(contract, tokenId, "", {
        allowFallback: true,
        indexingMethod: "onchain"
      });

      console.log("collection", collection)

      if (config.metadataIndexingMethod === "opensea" && collection?.isFallback) {
        collection = await MetadataProviderRouter.getCollectionMetadata(contract, tokenId, "", {
          allowFallback: false,
          indexingMethod: "simplehash",
        });
      }

      console.log("collection", collection)

      let tokenIdRange: string | null = null;
      if (collection.tokenIdRange) {
        tokenIdRange = `numrange(${collection.tokenIdRange[0]}, ${collection.tokenIdRange[1]}, '[]')`;
      } else if (collection.id === contract) {
        tokenIdRange = `'(,)'::numrange`;
      }

      console.log("tokenIdRange", tokenIdRange)

      // For covering the case where the token id range is null
      const tokenIdRangeParam = tokenIdRange ? "$/tokenIdRange:raw/" : "$/tokenIdRange/";

      const queries: PgPromiseQuery[] = [];

      console.log("1")

      // id: collection.id,
      // slug: collection.slug,
      // name: collection.name,
      // community: collection.community,
      // metadata: collection.metadata,
      // contract: toBuffer(collection.contract),
      // tokenIdRange,
      // tokenSetId: collection.tokenSetId,
      // mintedTimestamp: mintedTimestamp ?? null,
      // paymentTokens: collection.paymentTokens ? { opensea: collection.paymentTokens } : {},
      // creator: collection.creator ? toBuffer(collection.creator) : null,

      console.log("collection", collection)

      console.log("id", collection.id)
      console.log("slug", collection.slug)
      console.log("name", collection.name)
      console.log("community", collection.community)
      console.log("metadata", collection.metadata)
      console.log("contract", toBuffer(collection.contract))
      console.log("tokenIdRange", tokenIdRange)
      console.log("tokenSetId", collection.tokenSetId)
      console.log("mintedTimestamp", mintedTimestamp ?? null)
      console.log("paymentTokens", collection.paymentTokens ? { opensea: collection.paymentTokens } : {})
      console.log("creator", collection.creator ? toBuffer(collection.creator) : null)

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
              "payment_tokens",
              "creator"
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
              $/paymentTokens/,
              $/creator/
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
          creator: collection.creator ? toBuffer(collection.creator) : null,
        },
      });
      console.log("2")

      let tokenFilter = `AND "token_id" <@ ${tokenIdRangeParam}`;
      if (_.isNull(tokenIdRange)) {
        tokenFilter = `AND "token_id" = $/tokenId/`;
      }

      console.log("3")

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

      console.log("1")

      // Write the collection to the database
      await idb.none(pgp.helpers.concat(queries));

      console.log("2")

      // Schedule a job to re-count tokens in the collection
      await recalcTokenCountQueueJob.addToQueue({ collection: collection.id });

      console.log("3")

      await recalcOwnerCountQueueJob.addToQueue([
        { context: this.queueName, kind: "collectionId", data: { collectionId: collection.id } },
      ]);

      console.log("4")

      if (collection?.id && !config.disableRealtimeMetadataRefresh) {
        await metadataIndexFetchJob.addToQueue(
          [
            {
              kind: "single-token",
              data: {
                method: metadataIndexFetchJob.getIndexingMethod(collection.community),
                contract,
                tokenId,
                collection: collection.id,
              },
              context: this.queueName,
            },
          ],
          true,
          getNetworkSettings().metadataMintDelay
        );
      }

      console.log("5")

      // Refresh all royalty specs and the default royalties
      await royalties.refreshAllRoyaltySpecs(
        collection.id,
        collection.royalties as royalties.Royalty[] | undefined,
        collection.openseaRoyalties as royalties.Royalty[] | undefined
      );

      console.log("6")

      await royalties.refreshDefaultRoyalties(collection.id);

      // Refresh marketplace fees
      await marketplaceFees.updateMarketplaceFeeSpec(
        collection.id,
        "opensea",
        collection.openseaFees as royalties.Royalty[] | undefined
      );
      console.log("7")
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
