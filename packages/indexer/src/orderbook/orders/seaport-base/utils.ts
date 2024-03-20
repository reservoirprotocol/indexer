import { OrderKind } from "@reservoir0x/sdk/dist/seaport-base/types";

import { ridb } from "@/common/db";
import { logger } from "@/common/logger";
import { acquireLock, redis } from "@/common/redis";
import { getNetworkSettings } from "@/config/network";
import { refreshContractCollectionsMetadataQueueJob } from "@/jobs/collection-updates/refresh-contract-collections-metadata-queue-job";
import { Collections } from "@/models/collections";
import { toBuffer } from "@/common/utils";

export declare type OpenseaOrderParams = {
  kind: OrderKind;
  side: "buy" | "sell";
  hash: string;
  price?: string;
  paymentToken?: string;
  amount?: number;
  startTime?: number;
  endTime?: number;
  contract: string;
  tokenId?: string;
  offerer?: string;
  taker?: string;
  isDynamic?: boolean;
  collectionSlug: string;
  attributeKey?: string;
  attributeValue?: string;
};

export const getCollection = async (
  orderParams: OpenseaOrderParams
): Promise<{
  id: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  royalties: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  new_royalties: any;
  token_set_id: string | null;
} | null> => {
  if (orderParams.kind === "single-token") {
    return ridb.oneOrNone(
      `
        SELECT
          collections.id,
          collections.royalties,
          collections.new_royalties,
          collections.token_set_id
        FROM tokens
        JOIN collections
          ON tokens.collection_id = collections.id
        WHERE tokens.contract = $/contract/
          AND tokens.token_id = $/tokenId/
        LIMIT 1
      `,
      {
        contract: toBuffer(orderParams.contract),
        tokenId: orderParams.tokenId,
      }
    );
  } else {
    const collection = await ridb.oneOrNone(
      `
        SELECT
          collections.id,
          collections.royalties,
          collections.new_royalties,
          collections.token_set_id
        FROM collections
        WHERE collections.contract = $/contract/
          AND collections.slug = $/collectionSlug/
        ORDER BY created_at DESC
        LIMIT 1
      `,
      {
        contract: toBuffer(orderParams.contract),
        collectionSlug: orderParams.collectionSlug,
      }
    );

    if (!collection) {
      const lockAcquired = await acquireLock(
        `unknown-slug-refresh-contract-collections-metadata-lock:${orderParams.contract}:${orderParams.collectionSlug}`,
        60 * 60
      );

      logger.info(
        "unknown-collection-slug",
        JSON.stringify({
          orderId: orderParams.hash,
          contract: orderParams.contract,
          collectionSlug: orderParams.collectionSlug,
        })
      );

      if (lockAcquired) {
        // Try to refresh the contract collections metadata.
        await refreshContractCollectionsMetadataQueueJob.addToQueue({
          contract: orderParams.contract,
        });
      }
    }

    return collection;
  }
};

export const getCollectionFloorAskValue = async (
  contract: string,
  tokenId: number
): Promise<number | undefined> => {
  if (getNetworkSettings().multiCollectionContracts.includes(contract)) {
    const collection = await Collections.getByContractAndTokenId(contract, tokenId);
    return collection?.floorSellValue;
  } else {
    const collectionFloorAskValue = await redis.get(`collection-floor-ask:${contract}`);

    if (collectionFloorAskValue) {
      return Number(collectionFloorAskValue);
    } else {
      const query = `
        SELECT floor_sell_value
        FROM collections
        WHERE collections.contract = $/contract/
          AND collections.token_id_range @> $/tokenId/::NUMERIC(78, 0)
        LIMIT 1
      `;

      const collection = await ridb.oneOrNone(query, {
        contract: toBuffer(contract),
        tokenId,
      });

      const collectionFloorAskValue = collection?.floorSellValue || 0;

      await redis.set(`collection-floor-ask:${contract}`, collectionFloorAskValue, "EX", 3600);

      return collectionFloorAskValue;
    }
  }
};
