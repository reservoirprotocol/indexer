import { idb } from "@/common/db";
import { fromBuffer, toBuffer } from "@/common/utils";

export type MidaswapPool = {
  address: string;
  nft: string;
  token: string;
  freeRateBps: number;
  royaltyBps: number;
};

export const saveMidaswapPool = async (midaswapPool: MidaswapPool): Promise<MidaswapPool> => {
  await idb.none(
    `
      INSERT INTO midaswap_pools (
        address,
        nft,
        token,
        free_rate_bps,
        royalty_bps
      ) VALUES (
        $/address/,
        $/nft/,
        $/token/,
        $/freeRateBps/,
        $/royaltyBps/
      )
      ON CONFLICT DO NOTHING
    `,
    {
      address: toBuffer(midaswapPool.address),
      nft: toBuffer(midaswapPool.nft),
      token: toBuffer(midaswapPool.token),
      freeRateBps: midaswapPool.freeRateBps,
      royaltyBps: midaswapPool.royaltyBps,
    }
  );

  return midaswapPool;
};

export const getMidaswapPool = async (address: string): Promise<MidaswapPool> => {
  const result = await idb.oneOrNone(
    `
      SELECT
        midaswap_pools.address,
        midaswap_pools.nft,
        midaswap_pools.token,
        midaswap_pools.free_rate_bps,
        midaswap_pools.royalty_bps
      FROM midaswap_pools
      WHERE midaswap_pools.address = $/address/
    `,
    { address: toBuffer(address) }
  );

  return {
    address,
    nft: fromBuffer(result.nft),
    token: fromBuffer(result.token),
    freeRateBps: Number(result.free_rate_bps),
    royaltyBps: Number(result.royalty_bps),
  };
};
