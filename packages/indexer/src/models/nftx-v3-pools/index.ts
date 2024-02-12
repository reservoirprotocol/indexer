import { idb } from "@/common/db";
import { fromBuffer, toBuffer } from "@/common/utils";

export type NftxV3NftPool = {
  address: string;
  nft: string;
  vaultId: number;
};

export const saveNftxV3NftPool = async (nftxV3NftPool: NftxV3NftPool) => {
  await idb.none(
    `
      INSERT INTO nftx_v3_nft_pools (
        address,
        nft,
        vault_id
      ) VALUES (
        $/address/,
        $/nft/,
        $/vaultId/
      )
      ON CONFLICT DO NOTHING
    `,
    {
      address: toBuffer(nftxV3NftPool.address),
      nft: toBuffer(nftxV3NftPool.nft),
      vaultId: nftxV3NftPool.vaultId,
    }
  );

  return nftxV3NftPool;
};

export const getNftxV3NftPool = async (address: string): Promise<NftxV3NftPool> => {
  const result = await idb.oneOrNone(
    `
      SELECT
        nftx_v3_nft_pools.address,
        nftx_v3_nft_pools.nft,
        nftx_v3_nft_pools.vault_id
      FROM nftx_v3_nft_pools
      WHERE nftx_v3_nft_pools.address = $/address/
    `,
    { address: toBuffer(address) }
  );

  return {
    address,
    nft: fromBuffer(result.nft),
    vaultId: result.vault_id,
  };
};

export type NftxV3FtPool = {
  address: string;
  token0: string;
  token1: string;
  kind: "nftx-v3" | "sushiswap" | "uniswap-v3";
};

export const saveNftxV3FtPool = async (nftxV3FtPool: NftxV3FtPool) => {
  await idb.none(
    `
      INSERT INTO nftx_v3_ft_pools (
        address,
        token0,
        token1,
        pool_kind
      ) VALUES (
        $/address/,
        $/token0/,
        $/token1/,
        $/kind/
      )
      ON CONFLICT DO NOTHING
    `,
    {
      address: toBuffer(nftxV3FtPool.address),
      token0: toBuffer(nftxV3FtPool.token0),
      token1: toBuffer(nftxV3FtPool.token1),
      kind: nftxV3FtPool.kind,
    }
  );
  return nftxV3FtPool;
};

export const getNftxV3FtPool = async (address: string): Promise<NftxV3FtPool> => {
  const result = await idb.oneOrNone(
    `
      SELECT
        nftx_v3_ft_pools.address,
        nftx_v3_ft_pools.token0,
        nftx_v3_ft_pools.token1,
        nftx_v3_ft_pools.pool_kind
      FROM nftx_v3_ft_pools
      WHERE nftx_v3_ft_pools.address = $/address/
    `,
    { address: toBuffer(address) }
  );

  return {
    address,
    kind: result.pool_kind,
    token0: fromBuffer(result.token0),
    token1: fromBuffer(result.token1),
  };
};
