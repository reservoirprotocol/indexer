import { redb } from "@/common/db";
import { getOrUpdateBlurRoyalties } from "@/utils/blur";

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
        1
      FROM collections
      WHERE collections.id = $/collection/
      LIMIT 1
    `,
    { collection: options.contract }
  );
  if (!collectionResult) {
    throw new Error("Could not fetch collection");
  }

  if (!options.automatedRoyalties) {
    throw new Error("Automated royalties must be on");
  }

  // Include royalties
  let feeRate = 0;
  const royalties = await getOrUpdateBlurRoyalties(options.contract);
  if (royalties) {
    feeRate = royalties.maximumRoyaltyBps;
    if (options.royaltyBps !== undefined) {
      // The royalty bps to pay will be min(collectionRoyaltyBps, requestedRoyaltyBps)
      feeRate = Math.min(options.royaltyBps, feeRate);
    }
  }

  return {
    feeRate,
  };
};
