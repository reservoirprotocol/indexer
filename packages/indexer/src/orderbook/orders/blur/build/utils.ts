import { redb } from "@/common/db";
import { getBlurRoyalties, updateBlurRoyalties } from "@/utils/blur";

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

  // Include royalties
  let feeRate = 0;
  if (options.automatedRoyalties) {
    let royalties = await getBlurRoyalties(options.contract);
    if (!royalties) {
      royalties = await updateBlurRoyalties(options.contract);
    }

    if (royalties) {
      feeRate = royalties.maximumRoyaltyBps;
      if (options.royaltyBps !== undefined) {
        // The royalty bps to pay will be min(collectionRoyaltyBps, requestedRoyaltyBps)
        feeRate = Math.min(options.royaltyBps, feeRate);
      }
    }
  }

  return {
    feeRate,
  };
};
