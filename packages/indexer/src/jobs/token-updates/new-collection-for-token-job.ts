import { idb, pgp, PgPromiseQuery } from "@/common/db";
import { toBuffer } from "@/common/utils";
import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";
import { logger } from "@/common/logger";
import { recalcTokenCountQueueJob } from "@/jobs/collection-updates/recalc-token-count-queue-job";
import { recalcOwnerCountQueueJob } from "@/jobs/collection-updates/recalc-owner-count-queue-job";
import { config } from "@/config/index";
import { getNetworkSettings } from "@/config/network";
import { nonFlaggedFloorQueueJob } from "@/jobs/collection-updates/non-flagged-floor-queue-job";
import { collectionNormalizedJob } from "@/jobs/collection-updates/collection-normalized-floor-queue-job";
import { collectionFloorJob } from "@/jobs/collection-updates/collection-floor-queue-job";
import { metadataIndexFetchJob } from "@/jobs/metadata-index/metadata-fetch-job";
import { Collections } from "@/models/collections";
import { updateCollectionDailyVolumeJob } from "@/jobs/collection-updates/update-collection-daily-volume-job";
import { replaceActivitiesCollectionJob } from "@/jobs/elasticsearch/activities/replace-activities-collection-job";
import _ from "lodash";
import * as royalties from "@/utils/royalties";
import * as marketplaceFees from "@/utils/marketplace-fees";
import MetadataProviderRouter from "@/metadata/metadata-provider-router";
import PgPromise from "pg-promise";
import { tokenReassignedUserCollectionsJob } from "@/jobs/nft-balance-updates/token-reassigned-user-collections-job";

export type NewCollectionForTokenJobPayload = {
  contract: string;
  tokenId: string;
  mintedTimestamp?: number;
  newCollectionId: string;
  oldCollectionId: string;
  context?: string;
};

export class NewCollectionForTokenJob extends AbstractRabbitMqJobHandler {
  queueName = "new-collection-for-token";
  maxRetries = 10;
  concurrency = 1;
  backoff = {
    type: "exponential",
    delay: 10000,
  } as BackoffStrategy;

  protected async process(payload: NewCollectionForTokenJobPayload) {
    const { contract, tokenId, mintedTimestamp, newCollectionId, oldCollectionId } = payload;
    const queries: PgPromiseQuery[] = [];

    if (
      config.chainId === 137 &&
      _.includes(
        [
          "0x2953399124f0cbb46d2cbacd8a89cf0599974963:opensea-undefined",
          "0x2953399124f0cbb46d2cbacd8a89cf0599974963:opensea-null",
        ],
        newCollectionId
      )
    ) {
      return;
    }

    try {
      // Fetch collection from local DB
      let collection = await Collections.getById(newCollectionId);

      // If collection not found in the DB
      if (!collection) {
        logger.info(
          this.queueName,
          `collection for contract ${contract} tokenId ${tokenId} not found`
        );

        // Fetch collection metadata
        let collectionMetadata = await MetadataProviderRouter.getCollectionMetadata(
          contract,
          tokenId,
          "",
          {
            allowFallback: true,
          }
        );

        if (collectionMetadata?.isFallback) {
          collectionMetadata = await MetadataProviderRouter.getCollectionMetadata(
            contract,
            tokenId,
            "",
            {
              allowFallback: false,
              indexingMethod: "simplehash",
            }
          );
        }

        let tokenIdRange: string | null = null;
        if (collectionMetadata.tokenIdRange) {
          // Shared contract
          tokenIdRange = `numrange(${collectionMetadata.tokenIdRange[0]}, ${collectionMetadata.tokenIdRange[1]}, '[]')`;
        } else if (collectionMetadata.id === contract) {
          // Contract wide collection
          tokenIdRange = `'(,)'::numrange`;
        }

        // Check we have a name for the collection
        if (_.isNull(collectionMetadata.name)) {
          logger.warn(this.queueName, `no name for ${JSON.stringify(payload)}`);
          return;
        }

        // For covering the case where the token id range is null
        const tokenIdRangeParam = tokenIdRange ? "$/tokenIdRange:raw/" : "$/tokenIdRange/";

        // Create the collection in the DB
        const insertCollectionQuery = `
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
          `;

        const values = {
          id: collectionMetadata.id,
          slug: collectionMetadata.slug,
          name: collectionMetadata.name,
          community: collectionMetadata.community,
          metadata: collectionMetadata.metadata,
          contract: toBuffer(collectionMetadata.contract),
          tokenIdRange,
          tokenSetId: collectionMetadata.tokenSetId,
          mintedTimestamp: mintedTimestamp ?? null,
          paymentTokens: collectionMetadata.paymentTokens
            ? { opensea: collectionMetadata.paymentTokens }
            : {},
          creator: collectionMetadata.creator ? toBuffer(collectionMetadata.creator) : null,
        };

        await idb.none(insertCollectionQuery, values);

        // Retrieve the newly created collection
        collection = await Collections.getById(collectionMetadata.id);

        // If still no collection
        if (!collection) {
          logger.error(
            this.queueName,
            `failed to fetch/create collection ${JSON.stringify(
              payload
            )} collectionMetadata ${JSON.stringify(collectionMetadata)} query ${PgPromise.as.format(
              insertCollectionQuery,
              values
            )}`
          );
          return;
        }

        // As this is a new collection refresh all royalty specs and the default royalties
        await royalties.refreshAllRoyaltySpecs(
          collectionMetadata.id,
          collectionMetadata.royalties as royalties.Royalty[] | undefined,
          collectionMetadata.openseaRoyalties as royalties.Royalty[] | undefined
        );
        await royalties.refreshDefaultRoyalties(collectionMetadata.id);

        // Refresh marketplace fees
        await marketplaceFees.updateMarketplaceFeeSpec(
          collectionMetadata.id,
          "opensea",
          collectionMetadata.openseaFees as royalties.Royalty[] | undefined
        );
      }

      if (collection.id === oldCollectionId) {
        logger.info(
          this.queueName,
          `collection id ${collection.id} same as old collection id ${JSON.stringify(payload)}`
        );
        return;
      }

      if (this.updateActivities(contract)) {
        // Trigger async job to recalc the daily volumes
        await updateCollectionDailyVolumeJob.addToQueue({
          newCollectionId: collection.id,
          contract,
        });

        // Update the activities to the new collection
        await replaceActivitiesCollectionJob.addToQueue({
          contract,
          tokenId,
          newCollectionId: collection.id,
          oldCollectionId,
        });
      }

      // Update the token new collection
      queries.push({
        query: `
                UPDATE "tokens"
                SET "collection_id" = $/collection/,
                    "updated_at" = now()
                WHERE "contract" = $/contract/
                AND "token_id" = $/tokenId/
            `,
        values: {
          contract: toBuffer(contract),
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

      // Update the old collection's token count
      await recalcTokenCountQueueJob.addToQueue({
        collection: oldCollectionId,
      });

      await tokenReassignedUserCollectionsJob.addToQueue({ oldCollectionId, tokenId, contract });

      // If this is a new collection, recalculate floor price
      const floorAskInfo = {
        kind: "revalidation",
        contract,
        tokenId,
        txHash: null,
        txTimestamp: null,
      };

      await Promise.all([
        collectionFloorJob.addToQueue([floorAskInfo]),
        nonFlaggedFloorQueueJob.addToQueue([floorAskInfo]),
        collectionNormalizedJob.addToQueue([floorAskInfo]),
      ]);

      if (!config.disableRealtimeMetadataRefresh) {
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
    } catch (error) {
      logger.error(
        this.queueName,
        `Failed to fetch collection metadata ${JSON.stringify(payload)}: ${error}`
      );
      throw error;
    }
  }

  public updateActivities(contract: string) {
    if (config.chainId === 1) {
      return (
        _.indexOf(
          [
            "0x82c7a8f707110f5fbb16184a5933e9f78a34c6ab",
            "0x495f947276749ce646f68ac8c248420045cb7b5e",
          ],
          contract
        ) === -1
      );
    }

    if (config.chainId === 137) {
      return _.indexOf(["0x2953399124f0cbb46d2cbacd8a89cf0599974963"], contract) === -1;
    }

    return true;
  }

  public async addToQueue(infos: NewCollectionForTokenJobPayload[], jobId = "") {
    await this.sendBatch(
      infos.map((info) => {
        if (jobId === "") {
          // For contracts with multiple collections, we have to include the token in order the fetch the right collection
          jobId = getNetworkSettings().multiCollectionContracts.includes(info.contract)
            ? `${info.contract}-${info.tokenId}`
            : info.contract;
        }

        return {
          payload: info,
          jobId,
        };
      })
    );
  }
}

export const newCollectionForTokenJob = new NewCollectionForTokenJob();
