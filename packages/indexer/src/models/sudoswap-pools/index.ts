import { idb } from "@/common/db";
import { fromBuffer, toBuffer } from "@/common/utils";

export enum SudoswapPoolKind {
  TOKEN = 0,
  NFT = 1,
  TRADE = 2,
}

export type SudoswapPool = {
  address: string;
  nft: string;
  token: string;
  bondingCurve: string;
  poolKind: SudoswapPoolKind;
  pairKind: number;
};

export const saveSudoswapPool = async (sudoswapPool: SudoswapPool) => {
  await idb.none(
    `
      INSERT INTO sudoswap_pools (
        address,
        nft,
        token,
        bonding_curve,
        pool_kind,
        pair_kind
      ) VALUES (
        $/address/,
        $/nft/,
        $/token/,
        $/bondingCurve/,
        $/poolKind/,
        $/pairKind/
      )
      ON CONFLICT DO NOTHING
    `,
    {
      address: toBuffer(sudoswapPool.address),
      nft: toBuffer(sudoswapPool.nft),
      token: toBuffer(sudoswapPool.token),
      bondingCurve: toBuffer(sudoswapPool.bondingCurve),
      poolKind: sudoswapPool.poolKind,
      pairKind: sudoswapPool.pairKind,
    }
  );

  return sudoswapPool;
};

export const getSudoswapPool = async (address: string): Promise<SudoswapPool> => {
  const result = await idb.oneOrNone(
    `
      SELECT
        sudoswap_pools.address,
        sudoswap_pools.nft,
        sudoswap_pools.token,
        sudoswap_pools.bonding_curve,
        sudoswap_pools.pool_kind,
        sudoswap_pools.pair_kind
      FROM sudoswap_pools
      WHERE sudoswap_pools.address = $/address/
    `,
    { address: toBuffer(address) }
  );

  return {
    address,
    nft: fromBuffer(result.nft),
    token: fromBuffer(result.token),
    bondingCurve: fromBuffer(result.bonding_curve),
    poolKind: result.pool_kind,
    pairKind: result.pair_kind,
  };
};
