import { BigNumber } from "@ethersproject/bignumber";

import { idb } from "@/common/db";
import { logger } from "@/common/logger";
import { bn, fromBuffer, now, toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import { mintsRefreshJob } from "@/jobs/mints/mints-refresh-job";
import { MintTxSchema, CustomInfo } from "@/orderbook/mints/calldata";
import { getAmountMinted, getCurrentSupply } from "@/orderbook/mints/calldata/helpers";
import { simulateCollectionMint } from "@/orderbook/mints/simulation";

export type CollectionMintKind = "public" | "allowlist";
export type CollectionMintStatus = "open" | "closed";
export type CollectionMintStatusReason = "not-yet-started" | "ended" | "max-supply-exceeded";
export type CollectionMintStandard =
  | "unknown"
  | "manifold"
  | "seadrop-v1.0"
  | "thirdweb"
  | "zora"
  | "decent"
  | "foundation"
  | "lanyard"
  | "mintdotfun"
  | "soundxyz"
  | "createdotfun";

export type CollectionMintDetails = {
  tx: MintTxSchema;
  info?: CustomInfo;
};

export type CollectionMint = {
  collection: string;
  contract: string;
  stage: string;
  kind: CollectionMintKind;
  status: CollectionMintStatus;
  statusReason?: CollectionMintStatusReason;
  standard: CollectionMintStandard;
  details: CollectionMintDetails;
  currency: string;
  price?: string;
  tokenId?: string;
  maxMintsPerWallet?: string;
  maxSupply?: string;
  startTime?: number;
  endTime?: number;
  allowlistId?: string;
};

export const getCollectionMints = async (
  collection: string,
  filters?: {
    status?: CollectionMintStatus;
    standard?: CollectionMintStandard;
    stage?: string;
    tokenId?: string;
  }
): Promise<CollectionMint[]> => {
  const results = await idb.manyOrNone(
    `
      SELECT
        collection_mints.*,
        collection_mint_standards.standard,
        collections.contract
      FROM collection_mints
      JOIN collections
        ON collection_mints.collection_id = collections.id
      JOIN collection_mint_standards
        ON collection_mints.collection_id = collection_mint_standards.collection_id
      WHERE collection_mints.collection_id = $/collection/
      ${filters?.stage ? " AND collection_mints.stage = $/stage/" : ""}
      ${filters?.tokenId ? " AND collection_mints.token_id = $/tokenId/" : ""}
      ${filters?.standard ? " AND collection_mint_standards.standard = $/standard/" : ""}
        ${
          filters?.status === "open"
            ? " AND collection_mints.status = 'open'"
            : filters?.status === "closed"
            ? " AND collection_mints.status = 'closed'"
            : ""
        }
      ORDER BY collection_mints.price
    `,
    {
      collection,
      stage: filters?.stage,
      standard: filters?.standard,
      tokenId: filters?.tokenId,
      status: filters?.status,
    }
  );

  return results.map(
    (r) =>
      ({
        collection: r.collection_id,
        contract: fromBuffer(r.contract),
        stage: r.stage,
        kind: r.kind,
        status: r.status,
        standard: r.standard,
        details: r.details,
        currency: fromBuffer(r.currency),
        price: r.price ?? undefined,
        tokenId: r.token_id ?? undefined,
        maxMintsPerWallet: r.max_mints_per_wallet ?? undefined,
        maxSupply: r.max_supply ?? undefined,
        startTime: r.start_time ? Math.floor(new Date(r.start_time).getTime() / 1000) : undefined,
        endTime: r.end_time ? Math.floor(new Date(r.end_time).getTime() / 1000) : undefined,
        allowlistId: r.allowlist_id ?? undefined,
      } as CollectionMint)
  );
};

export const simulateAndUpsertCollectionMint = async (collectionMint: CollectionMint) => {
  // Very weird case when the collection generates 1000s of simulations
  const skip =
    config.chainId === 1 &&
    collectionMint.collection === "0x0c8b135a721b017f983f76bb32f53d37f8510a5b";
  if (skip) {
    return true;
  }

  const simulationResult = await simulateCollectionMint(collectionMint);
  if (simulationResult) {
    collectionMint.status = "open";
  } else {
    collectionMint.status = "closed";
  }

  const isOpen = collectionMint.status === "open";

  const existingCollectionMint = await getCollectionMints(collectionMint.collection, {
    stage: collectionMint.stage,
    standard: collectionMint.standard,
    tokenId: collectionMint.tokenId,
  }).then((results) => (results.length ? results[0] : undefined));

  if (existingCollectionMint) {
    // If the collection mint already exists, update any out-dated fields

    const updatedFields: string[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updatedParams: any = {};

    if (collectionMint.status !== existingCollectionMint.status) {
      updatedFields.push(" status = $/status/");
      updatedParams.status = collectionMint.status;
    }

    if (JSON.stringify(collectionMint.details) !== JSON.stringify(existingCollectionMint.details)) {
      updatedFields.push(" details = $/details:json/");
      updatedParams.details = collectionMint.details;
    }

    if (collectionMint.price !== existingCollectionMint.price) {
      updatedFields.push(" price = $/price/");
      updatedParams.price = collectionMint.price;
    }

    if (collectionMint.tokenId !== existingCollectionMint.tokenId) {
      updatedFields.push(" token_id = $/tokenId/");
      updatedParams.tokenId = collectionMint.tokenId;
    }

    if (collectionMint.maxMintsPerWallet !== existingCollectionMint.maxMintsPerWallet) {
      updatedFields.push(" max_mints_per_wallet = $/maxMintsPerWallet/");
      updatedParams.maxMintsPerWallet = collectionMint.maxMintsPerWallet;
    }

    if (collectionMint.maxSupply !== existingCollectionMint.maxSupply) {
      updatedFields.push(" max_supply = $/maxSupply/");
      updatedParams.maxSupply = collectionMint.maxSupply;
    }

    if (collectionMint.startTime !== existingCollectionMint.startTime) {
      updatedFields.push(" start_time = $/startTime/");
      updatedParams.startTime = collectionMint.startTime
        ? new Date(collectionMint.startTime * 1000)
        : null;
    }

    if (collectionMint.endTime !== existingCollectionMint.endTime) {
      updatedFields.push(" end_time = $/endTime/");
      updatedParams.endTime = collectionMint.endTime
        ? new Date(collectionMint.endTime * 1000)
        : null;
    }

    if (collectionMint.allowlistId !== existingCollectionMint.allowlistId) {
      updatedFields.push(" allowlist_id = $/allowlistId/");
      updatedParams.allowlistId = collectionMint.allowlistId;
    }

    if (updatedFields.length) {
      await idb.none(
        `
          UPDATE collection_mints SET
            ${updatedFields.join(", ")},
            updated_at = now()
          WHERE collection_mints.collection_id = $/collection/
            AND collection_mints.stage = $/stage/
            ${collectionMint.tokenId ? " AND collection_mints.token_id = $/tokenId/" : ""}
        `,
        {
          collection: collectionMint.collection,
          stage: collectionMint.stage,
          tokenId: collectionMint.tokenId,
          ...updatedParams,
        }
      );
    }

    // Make sure to auto-refresh "not-yey-started" mints
    if (collectionMint.statusReason === "not-yet-started") {
      logger.info(
        "mints-debug",
        JSON.stringify({
          collection: collectionMint.collection,
          delay: collectionMint.startTime! - now() + 30,
        })
      );
      await mintsRefreshJob.addToQueue(
        { collection: collectionMint.collection },
        collectionMint.startTime! - now()
      );
    }

    return isOpen;
  } else if (isOpen || collectionMint.statusReason === "not-yet-started") {
    // Otherwise, it's the first time we see this collection mint so we save it (only if it's open)

    const standardResult = await idb.oneOrNone(
      `
        SELECT
          collection_mint_standards.standard
        FROM collection_mint_standards
        WHERE collection_mint_standards.collection_id = $/collection/
      `,
      {
        collection: collectionMint.collection,
      }
    );
    if (!standardResult) {
      await idb.none(
        `
          INSERT INTO collection_mint_standards (
            collection_id,
            standard
          ) VALUES (
            $/collection/,
            $/standard/
          ) ON CONFLICT DO NOTHING
        `,
        {
          collection: collectionMint.collection,
          standard: collectionMint.standard,
        }
      );
    } else if (
      standardResult.standard !== collectionMint.standard &&
      // Never update back to "unknown"
      collectionMint.standard !== "unknown"
    ) {
      await idb.none(
        `
          UPDATE collection_mint_standards SET
            standard = $/standard/
          WHERE collection_mint_standards.collection_id = $/collection/
        `,
        {
          collection: collectionMint.collection,
          standard: collectionMint.standard,
        }
      );

      // If the standard got updated (eg. `unknown` -> something known), then
      // we need to delete all existing mints since they have different stages
      await idb.none(
        `
          DELETE FROM collection_mints WHERE collection_id = $/collection/
        `,
        {
          collection: collectionMint.collection,
        }
      );
    }

    await idb.none(
      `
        INSERT INTO collection_mints (
          collection_id,
          stage,
          kind,
          status,
          details,
          currency,
          price,
          token_id,
          max_mints_per_wallet,
          max_supply,
          start_time,
          end_time,
          allowlist_id
        ) VALUES (
          $/collection/,
          $/stage/,
          $/kind/,
          $/status/,
          $/details:json/,
          $/currency/,
          $/price/,
          $/tokenId/,
          $/maxMintsPerWallet/,
          $/maxSupply/,
          $/startTime/,
          $/endTime/,
          $/allowlistId/
        ) ON CONFLICT DO NOTHING
      `,
      {
        collection: collectionMint.collection,
        stage: collectionMint.stage,
        kind: collectionMint.kind,
        status: collectionMint.status,
        details: collectionMint.details,
        currency: toBuffer(collectionMint.currency),
        price: collectionMint.price ?? null,
        tokenId: collectionMint.tokenId ?? null,
        maxMintsPerWallet: collectionMint.maxMintsPerWallet ?? null,
        maxSupply: collectionMint.maxSupply ?? null,
        startTime: collectionMint.startTime ? new Date(collectionMint.startTime * 1000) : null,
        endTime: collectionMint.endTime ? new Date(collectionMint.endTime * 1000) : null,
        allowlistId: collectionMint.allowlistId ?? null,
      }
    );

    // Make sure to auto-refresh "not-yey-started" mints
    if (collectionMint.statusReason === "not-yet-started") {
      logger.info(
        "mints-debug",
        JSON.stringify({
          collection: collectionMint.collection,
          delay: collectionMint.startTime! - now() + 30,
        })
      );
      await mintsRefreshJob.addToQueue(
        { collection: collectionMint.collection },
        collectionMint.startTime! - now()
      );
    }

    return true;
  }

  return false;
};

export const getAmountMintableByWallet = async (
  collectionMint: CollectionMint,
  user: string
): Promise<BigNumber | undefined> => {
  let amountMintable: BigNumber | undefined;

  // Handle remaining supply
  if (collectionMint.maxSupply) {
    const currentSupply = await getCurrentSupply(collectionMint);
    const remainingSupply = bn(collectionMint.maxSupply).sub(currentSupply);
    if (remainingSupply.gt(0)) {
      amountMintable = remainingSupply;
    }
  }

  // Handle maximum amount mintable per wallet
  if (collectionMint.maxMintsPerWallet) {
    const mintedAmount = await getAmountMinted(collectionMint, user);
    const remainingAmount = bn(collectionMint.maxMintsPerWallet).sub(mintedAmount);
    if (!amountMintable) {
      amountMintable = remainingAmount;
    } else {
      amountMintable = remainingAmount.lt(amountMintable) ? remainingAmount : amountMintable;
    }
  }

  return amountMintable;
};
