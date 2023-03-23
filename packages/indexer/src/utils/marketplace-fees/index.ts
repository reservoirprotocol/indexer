import { AddressZero } from "@ethersproject/constants";
import _ from "lodash";

import { idb } from "@/common/db";
import { Tokens } from "@/models/tokens";
import { tryGetCollectionOpenseaFees } from "@/utils/opensea";
import { redis } from "@/common/redis";
import { now } from "@/common/utils";
import { logger } from "@/common/logger";
import * as collectionUpdatesMetadata from "@/jobs/collection-updates/metadata-queue";
import { Collections } from "@/models/collections";

export type MarketPlaceFee = {
  recipient: string;
  bps: number;
};

export const updateMarketplaceFeeSpec = async (
  collection: string,
  spec: string,
  marketplaceFees?: MarketPlaceFee[]
) => {
  // For safety, skip any zero bps or recipients
  marketplaceFees = marketplaceFees
    ? marketplaceFees.filter(({ bps, recipient }) => bps && recipient !== AddressZero)
    : undefined;

  // Fetch the current royalties
  const currentMarketplaceFees = await idb.oneOrNone(
    `
      SELECT
        COALESCE(collections.marketplace_fees, '{}') AS marketplace_fees
      FROM collections
      WHERE collections.id = $/collection/
    `,
    { collection }
  );

  if (currentMarketplaceFees) {
    // Always keep the latest royalty per spec
    if (
      !_.isEqual(currentMarketplaceFees.marketplace_fees[spec], marketplaceFees) ||
      !(spec in currentMarketplaceFees.marketplace_fees)
    ) {
      currentMarketplaceFees.marketplace_fees[spec] = marketplaceFees;

      await idb.none(
        `
          UPDATE collections
            SET marketplace_fees = $/marketplaceFees:json/
          WHERE collections.id = $/collection/
        `,
        {
          collection,
          marketplaceFees: currentMarketplaceFees.marketplace_fees,
        }
      );
    }
  }
};

export const getCollectionOpenseaFees = async (
  collection: string,
  contract: string,
  totalBps?: number
) => {
  const openseaMarketplaceFees: MarketPlaceFee[] = [];

  const tokenId = await Tokens.getSingleToken(collection);
  const tryGetCollectionOpenseaFeesResult = await tryGetCollectionOpenseaFees(contract, tokenId);

  if (tryGetCollectionOpenseaFeesResult.isSuccess) {
    const openseaFees = tryGetCollectionOpenseaFeesResult.openseaFees;

    for (const [feeRecipient, feeBps] of Object.entries(openseaFees)) {
      openseaMarketplaceFees.push({ recipient: feeRecipient, bps: feeBps });
    }

    await updateMarketplaceFeeSpec(
      collection,
      "opensea",
      openseaMarketplaceFees as MarketPlaceFee[]
    );
  } else if (totalBps != null && totalBps < 50) {
    openseaMarketplaceFees.push({
      recipient: "0x0000a26b00c1f0df003000390027140000faa719",
      bps: 50 - totalBps,
    });
  }

  return openseaMarketplaceFees;
};

export const refreshCollectionOpenseaFeesAsync = async (collection: string) => {
  const cacheKey = `refresh-collection-opensea-fees:${collection}`;

  if ((await redis.set(cacheKey, now(), "EX", 86400, "NX")) === "OK") {
    logger.info("refreshCollectionOpenseaFeesAsync", `refresh fees. collection=${collection}`);

    try {
      const tokenId = await Tokens.getSingleToken(collection);
      const collectionResult = await Collections.getById(collection);

      await collectionUpdatesMetadata.addToQueue(
        collectionResult!.contract,
        tokenId,
        collectionResult!.community
      );
    } catch {
      await redis.del(cacheKey);
    }
  }
};
