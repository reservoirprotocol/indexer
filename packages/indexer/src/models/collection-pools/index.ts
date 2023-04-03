import { idb } from "@/common/db";
import { fromBuffer, toBuffer } from "@/common/utils";

export enum CollectionPoolType {
  TOKEN = 0,
  NFT = 1,
  TRADE = 2,
}

export enum CollectionPoolVariant {
  ENUMERABLE_ETH = 0,
  MISSING_ENUMERABLE_ETH = 1,
  ENUMERABLE_ERC20 = 2,
  MISSING_ENUMERABLE_ERC20 = 3,
}

export type CollectionPool = {
  address: string;
  nft: string;
  token: string;
  bondingCurve: string;
  poolVariant: CollectionPoolVariant;
  poolType: CollectionPoolType;
};

export const saveCollectionPool = async (collectionPool: CollectionPool) => {
  await idb.none(
    `
      INSERT INTO collection_pools (
        address,
        nft,
        token,
        bonding_curve,
        pool_variant,
        pool_type
      ) VALUES (
        $/address/,
        $/nft/,
        $/token/,
        $/bondingCurve/,
        $/poolVariant/,
        $/poolType/
      )
      ON CONFLICT DO NOTHING
    `,
    {
      address: toBuffer(collectionPool.address),
      nft: toBuffer(collectionPool.nft),
      token: toBuffer(collectionPool.token),
      bondingCurve: toBuffer(collectionPool.bondingCurve),
      poolVariant: collectionPool.poolVariant,
      poolType: collectionPool.poolType,
    }
  );

  return collectionPool;
};

export const getCollectionPool = async (address: string): Promise<CollectionPool> => {
  const result = await idb.oneOrNone(
    `
      SELECT
        collection_pools.address,
        collection_pools.nft,
        collection_pools.token,
        collection_pools.bonding_curve,
        collection_pools.pool_variant,
        collection_pools.pool_type
      FROM collection_pools
      WHERE collection_pools.address = $/address/
    `,
    { address: toBuffer(address) }
  );

  return {
    address,
    nft: fromBuffer(result.nft),
    token: fromBuffer(result.token),
    bondingCurve: fromBuffer(result.bonding_curve),
    poolType: result.pool_type,
    poolVariant: result.pool_variant,
  };
};
