export * as registry from "@/utils/royalties/registry";

import { edb } from "@/common/db";

export type Royalty = {
  recipient: string;
  bps: number;
};

// default royalty = max royalty across all available royalty standards
export const getDefaultRoyalties = async (collection: string): Promise<Royalty[]> => {
  // Due to legacy reasons, we have the royalties of a collection split over two colums:
  // `royalties` and `royalties_new`. The `royalties` column holds an array of `Royalty`
  // objects, while the `new_royalties` column holds an object pointing to arrays which
  // have `Royalty` values (this is for accommodating multiple royalty standards - with
  // each key of the object denoting a different standard).
  const royaltiesResult = await edb.oneOrNone(
    `
      SELECT
        collections.royalties,
        collections.new_royalties
      FROM collections
      WHERE collections.id = $/collection/
    `,
    { collection }
  );
  if (!royaltiesResult) {
    return [];
  }

  const getTotalRoyaltyBps = (royalties?: Royalty[]) =>
    (royalties || []).map(({ bps }) => bps).reduce((a, b) => a + b, 0);

  let currentRoyalties: Royalty[] = [];
  let currentTotalBps = 0;

  // Handle `royalties`
  const royaltiesTotalBps = getTotalRoyaltyBps(royaltiesResult.royalties);
  if (royaltiesTotalBps > currentTotalBps) {
    currentRoyalties = royaltiesResult.royalties;
    currentTotalBps = royaltiesTotalBps;
  }

  // Handle `new_royalties`
  for (const kind of Object.keys(royaltiesResult.new_royalties || {})) {
    const newRoyaltiesTotalBps = getTotalRoyaltyBps(royaltiesResult.new_royalties[kind]);
    if (newRoyaltiesTotalBps > currentTotalBps) {
      currentRoyalties = royaltiesResult.new_royalties[kind];
      currentTotalBps = newRoyaltiesTotalBps;
    }
  }

  return currentRoyalties;
};
