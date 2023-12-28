/* eslint-disable @typescript-eslint/no-explicit-any */

import _ from "lodash";

import { idb, redb } from "@/common/db";
import { logger } from "@/common/logger";
import { toBuffer, now } from "@/common/utils";
import {
  CollectionsEntity,
  CollectionsEntityParams,
  CollectionsEntityUpdateParams,
} from "@/models/collections/collections-entity";
import { updateBlurRoyalties } from "@/utils/blur";
import * as erc721c from "@/utils/erc721c";
import * as marketplaceBlacklist from "@/utils/marketplace-blacklists";
import * as marketplaceFees from "@/utils/marketplace-fees";
import * as paymentProcessor from "@/utils/payment-processor";
import * as paymentProcessorV2 from "@/utils/payment-processor-v2";

import MetadataProviderRouter from "@/metadata/metadata-provider-router";
import * as royalties from "@/utils/royalties";

import { recalcOwnerCountQueueJob } from "@/jobs/collection-updates/recalc-owner-count-queue-job";
import { fetchCollectionMetadataJob } from "@/jobs/token-updates/fetch-collection-metadata-job";
import { refreshActivitiesCollectionMetadataJob } from "@/jobs/elasticsearch/activities/refresh-activities-collection-metadata-job";
import { orderUpdatesByIdJob } from "@/jobs/order-updates/order-updates-by-id-job";
import {
  topBidCollectionJob,
  TopBidCollectionJobPayload,
} from "@/jobs/collection-updates/top-bid-collection-job";
import { recalcTokenCountQueueJob } from "@/jobs/collection-updates/recalc-token-count-queue-job";
import { Contracts } from "@/models/contracts";
import * as registry from "@/utils/royalties/registry";

import { AlchemyApi } from "@/utils/alchemy";
import { AlchemySpamContracts } from "@/models/alchemy-spam-contracts";
import {
  ActionsLogContext,
  ActionsLogOrigin,
  actionsLogJob,
} from "@/jobs/general-tracking/actions-log-job";

export class Collections {
  public static async getById(collectionId: string, readReplica = false) {
    const dbInstance = readReplica ? redb : idb;
    const collection: CollectionsEntityParams | null = await dbInstance.oneOrNone(
      `
        SELECT
          *
        FROM collections
        WHERE id = $/collectionId/
      `,
      { collectionId }
    );

    if (collection) {
      return new CollectionsEntity(collection);
    }

    return null;
  }

  public static async getByContractAndTokenId(
    contract: string,
    tokenId: number,
    readReplica = false
  ) {
    const dbInstance = readReplica ? redb : idb;
    const collection: CollectionsEntityParams | null = await dbInstance.oneOrNone(
      `
        SELECT
          *
        FROM collections
        WHERE collections.contract = $/contract/
          AND collections.token_id_range @> $/tokenId/::NUMERIC(78, 0)
        ORDER BY collections.created_at DESC
        LIMIT 1
      `,
      {
        contract: toBuffer(contract),
        tokenId,
      }
    );

    if (collection) {
      return new CollectionsEntity(collection);
    }

    return null;
  }

  public static async getByTokenSetId(tokenSetId: string) {
    const collection: CollectionsEntityParams | null = await redb.oneOrNone(
      `
        SELECT
          *
        FROM collections
        WHERE token_set_id = $/tokenSetId/
      `,
      { tokenSetId }
    );

    if (collection) {
      return new CollectionsEntity(collection);
    }

    return null;
  }

  public static async updateCollectionCache(contract: string, tokenId: string, community = "") {
    try {
      await Contracts.updateContractMetadata(contract);
    } catch (error) {
      logger.error(
        "updateCollectionCache",
        `updateContractMetadataError. contract=${contract}, tokenId=${tokenId}, community=${community}`
      );
    }

    const collectionResult = await idb.oneOrNone(
      `
        SELECT
          collections.id,
          collections.is_spam AS "isSpam"
        FROM tokens
        JOIN collections
          ON tokens.collection_id = collections.id
        WHERE tokens.contract = $/contract/
          AND tokens.token_id = $/tokenId/
      `,
      {
        contract: toBuffer(contract),
        tokenId,
      }
    );

    if (!collectionResult?.id) {
      // If the collection doesn't exist, push a job to retrieve it
      await fetchCollectionMetadataJob.addToQueue([
        {
          contract,
          tokenId,
        },
      ]);

      return;
    }

    try {
      await registry.refreshRegistryRoyalties(collectionResult.id);
      await royalties.refreshDefaultRoyalties(collectionResult.id);
    } catch (error) {
      logger.error(
        "updateCollectionCache",
        `refreshRegistryRoyaltiesError. contract=${contract}, tokenId=${tokenId}, community=${community}`
      );
    }

    const collection = await MetadataProviderRouter.getCollectionMetadata(
      contract,
      tokenId,
      community
    );

    if (collection.metadata == null) {
      const collectionResult = await Collections.getById(collection.id);

      if (collectionResult?.metadata != null) {
        logger.error(
          "updateCollectionCache",
          `InvalidUpdateCollectionCache. contract=${contract}, tokenId=${tokenId}, community=${community}, collection=${JSON.stringify(
            collection
          )}, collectionResult=${JSON.stringify(collectionResult)}`
        );

        throw new Error("Invalid collection metadata");
      }
    }

    await recalcTokenCountQueueJob.addToQueue({ collection: collection.id });
    await recalcOwnerCountQueueJob.addToQueue([
      {
        context: "updateCollectionCache",
        kind: "collectionId",
        data: { collectionId: collection.id },
      },
    ]);

    // Check if the collection already marked as spam
    let isSpamContract = false;
    if (Number(collectionResult.isSpam) === 0) {
      isSpamContract = await AlchemyApi.isSpamContract(collection.contract);
      if (isSpamContract && !(await AlchemySpamContracts.exists(collection.contract))) {
        await AlchemySpamContracts.add(collection.contract);

        // Track the change
        await actionsLogJob.addToQueue([
          {
            context: ActionsLogContext.SpamContractUpdate,
            origin: ActionsLogOrigin.CollectionRefresh,
            actionTakerIdentifier: "alchemy",
            contract,
            data: {
              newSpamState: 1,
            },
          },
        ]);
      }
    }

    const query = `
      UPDATE collections SET
        metadata = $/metadata:json/,
        name = $/name/,
        slug = $/slug/,
        payment_tokens = $/paymentTokens/,
        creator = $/creator/,
        is_spam = CASE WHEN (is_spam IS NULL OR is_spam = 0) THEN $/isSpamContract/ ELSE is_spam END,
        updated_at = now(),
        image_version = CASE WHEN (metadata IS DISTINCT FROM $/metadata:json/) THEN now() ELSE image_version END
      WHERE id = $/id/
      AND (metadata IS DISTINCT FROM $/metadata:json/ 
            OR name IS DISTINCT FROM $/name/ 
            OR slug IS DISTINCT FROM $/slug/
            OR payment_tokens IS DISTINCT FROM $/paymentTokens/
            OR creator IS DISTINCT FROM $/creator/
            OR ((is_spam IS NULL OR is_spam = 0) AND $/isSpamContract/ = 1)
            )
      RETURNING (
                  SELECT
                  json_build_object(
                    'name', collections.name,
                    'metadata', collections.metadata
                  )
                  FROM collections
                  WHERE collections.id = $/id/
                ) AS old_metadata
    `;

    const values = {
      id: collection.id,
      metadata: collection.metadata || {},
      name: collection.name,
      slug: collection.slug,
      paymentTokens: collection.paymentTokens ? { opensea: collection.paymentTokens } : {},
      creator: collection.creator ? toBuffer(collection.creator) : null,
      isSpamContract: Number(isSpamContract),
    };

    const result = await idb.oneOrNone(query, values);

    try {
      if (
        result &&
        (result?.old_metadata.name != collection.name ||
          result?.old_metadata.metadata?.imageUrl != (collection.metadata as any)?.imageUrl)
      ) {
        logger.info(
          "updateCollectionCache",
          JSON.stringify({
            topic: "debugActivitiesErrors",
            message: `refreshActivitiesCollectionMetadataJob. collectionId=${collection.id}, contract=${contract}, tokenId=${tokenId}, community=${community}`,
            collectionId: collection.id,
            collection,
            result,
          })
        );

        await refreshActivitiesCollectionMetadataJob.addToQueue({
          collectionId: collection.id,
          context: "updateCollectionCache",
        });
      }
    } catch (error) {
      logger.error(
        "updateCollectionCache",
        `refreshActivitiesCollectionMetadataJobError. contract=${contract}, tokenId=${tokenId}, community=${community}, collection=${JSON.stringify(
          collection
        )}, result=${JSON.stringify(result)}`
      );
    }

    // Refresh all royalty specs and the default royalties
    await royalties.refreshAllRoyaltySpecs(
      collection.id,
      collection.royalties as royalties.Royalty[] | undefined,
      collection.openseaRoyalties as royalties.Royalty[] | undefined,
      false
    );

    await royalties.refreshDefaultRoyalties(collection.id);

    // Refresh Blur royalties (which get stored separately)
    await updateBlurRoyalties(collection.id, true);

    // Refresh OpenSea marketplace fees
    const openseaFees = collection.openseaFees as royalties.Royalty[] | undefined;
    await marketplaceFees.updateMarketplaceFeeSpec(collection.id, "opensea", openseaFees);

    // Refresh any contract blacklists
    await marketplaceBlacklist.checkMarketplaceIsFiltered(collection.contract, [], true);

    // Refresh ERC721C config
    await erc721c.refreshConfig(collection.contract);

    // Refresh Payment Processor
    await Promise.all([
      paymentProcessor.getConfigByContract(collection.contract, true),
      paymentProcessorV2.getConfigByContract(collection.contract, true),
    ]);
  }

  public static async update(collectionId: string, fields: CollectionsEntityUpdateParams) {
    let updateString = "";
    const replacementValues = {
      collectionId,
    };

    _.forEach(fields, (value, fieldName) => {
      updateString += `${_.snakeCase(fieldName)} = $/${fieldName}/,`;
      (replacementValues as any)[fieldName] = value;
    });

    updateString = _.trimEnd(updateString, ",");

    const query = `
      UPDATE collections
        SET updated_at = now(), ${updateString}
      WHERE id = $/collectionId/
    `;

    return await idb.none(query, replacementValues);
  }

  public static async getCollectionsMintedBetween(from: number, to: number, limit = 2000) {
    const query = `
      SELECT
        *
      FROM collections
      WHERE minted_timestamp > ${from}
        AND minted_timestamp < ${to}
      ORDER BY minted_timestamp ASC
      LIMIT ${limit}
    `;

    const collections = await redb.manyOrNone(query);
    if (!_.isEmpty(collections)) {
      return _.map(collections, (collection) => new CollectionsEntity(collection));
    }

    return [];
  }

  public static async getTopCollectionsByVolume(limit = 500) {
    const query = `
      SELECT
        *
      FROM collections
      ORDER BY day1_volume DESC
      LIMIT ${limit}
    `;

    const collections = await redb.manyOrNone(query);
    if (!_.isEmpty(collections)) {
      return _.map(collections, (collection) => new CollectionsEntity(collection));
    }

    return [];
  }

  public static async recalculateCollectionFloorSell(collection: string) {
    const query = `
      UPDATE collections SET
        floor_sell_id = x.floor_sell_id,
        floor_sell_value = x.floor_sell_value,
        floor_sell_maker = x.floor_sell_maker,
        floor_sell_source_id_int = x.source_id_int,
        floor_sell_valid_between = x.valid_between,
        updated_at = now()
      FROM (
        SELECT
          tokens.floor_sell_id,
          tokens.floor_sell_value,
          tokens.floor_sell_maker,
          orders.source_id_int,
          orders.valid_between
        FROM tokens
        LEFT JOIN orders
        ON tokens.floor_sell_id = orders.id
        WHERE tokens.collection_id = $/collection/
        ORDER BY tokens.floor_sell_value
        LIMIT 1
      ) x
      WHERE collections.id = $/collection/
      AND (
        collections.floor_sell_id IS DISTINCT FROM x.floor_sell_id
        OR collections.floor_sell_value IS DISTINCT FROM x.floor_sell_value
      )
    `;

    await idb.none(query, {
      collection,
    });
  }

  public static async recalculateContractFloorSell(contract: string) {
    const result = await redb.manyOrNone(
      `
        SELECT
          tokens.token_id
        FROM tokens
        WHERE tokens.contract = $/contract/
          AND tokens.floor_sell_value IS NOT NULL
        LIMIT 10000
      `,
      { contract: toBuffer(contract) }
    );

    if (result) {
      const currentTime = now();
      await orderUpdatesByIdJob.addToQueue(
        result.map(({ token_id }) => {
          const tokenSetId = `token:${contract}:${token_id}`;
          return {
            context: `revalidate-sell-${tokenSetId}-${currentTime}`,
            tokenSetId,
            side: "sell",
            trigger: { kind: "revalidation" },
          };
        })
      );
    }
  }

  public static async recalculateContractTopBuy(contract: string) {
    const result = await redb.manyOrNone(
      `
        SELECT
          tokens.token_id
        FROM tokens
        WHERE tokens.contract = $/contract/
        LIMIT 10000
      `,
      { contract: toBuffer(contract) }
    );

    if (result) {
      const currentTime = now();
      await orderUpdatesByIdJob.addToQueue(
        result.map(({ token_id }) => {
          const tokenSetId = `token:${contract}:${token_id}`;
          return {
            context: `revalidate-buy-${tokenSetId}-${currentTime}`,
            tokenSetId,
            side: "buy",
            trigger: { kind: "revalidation" },
          };
        })
      );
    }
  }

  public static async revalidateCollectionTopBuy(collection: string) {
    const tokenSetsResult = await redb.manyOrNone(
      `
        SELECT token_sets.id
        FROM token_sets
        WHERE token_sets.collection_id = $/collection/
          AND token_sets.top_buy_value IS NOT NULL
      `,
      { collection }
    );

    if (tokenSetsResult.length) {
      const currentTime = now();
      await orderUpdatesByIdJob.addToQueue(
        tokenSetsResult.map((tokenSet: { id: any }) => ({
          context: `revalidate-buy-${tokenSet.id}-${currentTime}`,
          tokenSetId: tokenSet.id,
          side: "buy",
          trigger: { kind: "revalidation" },
        }))
      );
    } else {
      logger.info(
        "revalidateCollectionTopBuy",
        JSON.stringify({
          message: "No token sets with top bid found for collection",
          collection,
        })
      );

      await topBidCollectionJob.addToQueue([
        {
          collectionId: collection,
          kind: "revalidation",
          txHash: null,
          txTimestamp: null,
        } as TopBidCollectionJobPayload,
      ]);
    }
  }

  public static async getIdsByCommunity(community: string) {
    const query = `
      SELECT id
      FROM collections
      WHERE community = $/community/
    `;

    const collectionIds = await idb.manyOrNone(query, { community });
    return _.map(collectionIds, "id");
  }
}
