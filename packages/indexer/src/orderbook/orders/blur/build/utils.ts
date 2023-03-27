import { redb } from "@/common/db";

export interface BaseOrderBuildOptions {
  maker: string;
  contract: string;
  weiPrice: string;
  expirationTime?: number;
  currency?: string;
  authToken: string;
  automatedRoyalties?: boolean;
  royaltyBps?: number;
}

type OrderBuildInfo = {
  feeRate: number;
};

export const getBuildInfo = async (options: BaseOrderBuildOptions): Promise<OrderBuildInfo> => {
  const collectionResult = await redb.oneOrNone(
    `
      SELECT
        collections.royalties,
        collections.new_royalties
      FROM collections
      WHERE collections.id = $/collection/
      LIMIT 1
    `,
    { collection: options.contract }
  );
  if (!collectionResult) {
    throw new Error("Could not fetch collection");
  }

  // Include royalties
  let feeRate = 50;
  if (options.automatedRoyalties) {
    const royalties: { bps: number; recipient: string }[] = collectionResult.royalties ?? [];

    feeRate = royalties.map(({ bps }) => bps).reduce((a, b) => a + b, 0);
    if (options.royaltyBps !== undefined) {
      // The royalty bps to pay will be min(collectionRoyaltyBps, requestedRoyaltyBps)
      feeRate = Math.min(options.royaltyBps, feeRate);
    }
  }

  return {
    feeRate,
  };
};
