import { idb } from "@/common/db";
import { fromBuffer, toBuffer } from "@/common/utils";
import { MintTxSchema, CustomInfo } from "@/orderbook/mints/calldata";
import { simulateCollectionMint } from "@/orderbook/mints/simulation";

type CollectionMintKind = "public" | "allowlist";
type CollectionMintStatus = "open" | "closed";
type CollectionMintStandard = "unknown" | "manifold" | "seadrop-v1.0" | "thirdweb" | "zora";

export type CollectionMintDetails = {
  tx: MintTxSchema;
  info?: CustomInfo;
};

export type CollectionMint = {
  collection: string;
  stage: string;
  kind: CollectionMintKind;
  status: CollectionMintStatus;
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

export const getOpenCollectionMints = async (collection: string): Promise<CollectionMint[]> => {
  const results = await idb.manyOrNone(
    `
      SELECT
        collection_mints.*,
        collection_mint_standards.standard
      FROM collection_mints
      JOIN collection_mint_standards
        ON collection_mints.collection_id = collection_mint_standards.collection_id
      WHERE collection_mints.collection_id = $/collection/
        AND collection_mints.status = 'open'
    `,
    { collection }
  );

  return results.map(
    (r) =>
      ({
        collection: r.collection_id,
        stage: r.stage,
        kind: r.kind,
        status: r.status,
        standard: r.standard,
        details: r.details,
        currency: fromBuffer(r.currency),
        price: r.price,
        tokenId: r.token_id,
        maxMintsPerWallet: r.max_mints_per_wallet,
        maxSupply: r.max_supply,
        startTime: r.start_time ? Math.floor(new Date(r.start_time).getTime() / 1000) : undefined,
        endTime: r.end_time ? Math.floor(new Date(r.end_time).getTime() / 1000) : undefined,
        allowlistId: r.allowlist_id,
      } as CollectionMint)
  );
};

export const refreshCollectionMint = async (collectionMint: CollectionMint) => {
  // TODO: At the moment, the refresh will simply simulate the details
  // of an existing mint. This will fail in scenarios where parameters
  // of the mint get changed. What we should do instead is trigger the
  // detection process and update any parameters that changed. This is
  // something that can work for both public and private mints.

  if (collectionMint.kind === "public") {
    const success = await simulateCollectionMint(collectionMint, false);
    await idb.none(
      `
        UPDATE collection_mints SET
          status = $/status/,
          updated_at = now()
        WHERE collection_mints.collection_id = $/collection/
          AND collection_mints.stage = $/stage/
          AND collection_mints.status != $/status/
      `,
      {
        collection: collectionMint.collection,
        stage: collectionMint.stage,
        status: success ? "open" : "closed",
      }
    );
  }
};

export const saveCollectionMint = async (collectionMint: CollectionMint) => {
  const success = await simulateCollectionMint(collectionMint);
  if (success) {
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
  }

  return success;
};
