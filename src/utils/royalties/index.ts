import { AddressZero } from "@ethersproject/constants";
import _ from "lodash";

import { idb } from "@/common/db";
import { toBuffer } from "@/common/utils";
import * as registry from "@/utils/royalties/registry";

export type Royalty = {
  recipient: string;
  bps: number;
};

export const getRoyalties = async (
  contract: string,
  tokenId?: string,
  spec = "default"
): Promise<Royalty[]> => {
  const royaltiesResult = await idb.oneOrNone(
    `
      SELECT
        collections.royalties,
        collections.new_royalties
      FROM tokens
      JOIN collections
        ON tokens.collection_id = collections.id
      WHERE tokens.contract = $/contract/
        ${tokenId ? " AND tokens.token_id = $/tokenId/" : ""}
      LIMIT 1
    `,
    {
      contract: toBuffer(contract),
      tokenId,
    }
  );
  if (!royaltiesResult) {
    return [];
  }

  if (spec === "default") {
    return royaltiesResult.royalties ?? [];
  } else {
    return (royaltiesResult.new_royalties ?? {})[spec] ?? [];
  }
};

export const getRoyaltiesByTokenSet = async (
  tokenSetId: string,
  spec = "default"
): Promise<Royalty[]> => {
  let royaltiesResult;
  const tokenSetIdComponents = tokenSetId.split(":");

  switch (tokenSetIdComponents[0]) {
    case "token":
    case "range": {
      royaltiesResult = await idb.oneOrNone(
        `
          SELECT
            collections.royalties,
            collections.new_royalties
          FROM tokens
          JOIN collections
            ON tokens.collection_id = collections.id
          WHERE tokens.contract = $/contract/
            AND tokens.token_id = $/tokenId/
          LIMIT 1
        `,
        {
          contract: toBuffer(tokenSetIdComponents[1]),
          tokenId: tokenSetIdComponents[2],
        }
      );

      break;
    }

    case "contract": {
      royaltiesResult = await idb.oneOrNone(
        `
          SELECT
            collections.royalties,
            collections.new_royalties
          FROM collections
          WHERE collections.id = $/id/
          LIMIT 1
        `,
        {
          id: tokenSetIdComponents[1],
        }
      );

      break;
    }

    default: {
      royaltiesResult = await idb.oneOrNone(
        `
          SELECT
            collections.royalties,
            collections.new_royalties
          FROM (
            SELECT
              token_sets_tokens.contract,
              token_sets_tokens.token_id
            FROM token_sets_tokens
            WHERE token_set_id = $/tokenSetId/
            LIMIT 1
          ) x
          JOIN tokens
            ON tokens.token_id = x.token_id AND tokens.contract = x.contract
          JOIN collections
            ON tokens.collection_id = collections.id
          LIMIT 1
        `,
        {
          tokenSetId,
        }
      );

      break;
    }
  }

  if (!royaltiesResult) {
    return [];
  }

  if (spec === "default") {
    return royaltiesResult.royalties ?? [];
  } else {
    return (royaltiesResult.new_royalties ?? {})[spec] ?? [];
  }
};

export const updateRoyaltySpec = async (collection: string, spec: string, royalties: Royalty[]) => {
  if (!royalties.length) {
    return;
  }

  // For safety, skip any zero bps or recipients
  royalties = royalties.filter(({ bps, recipient }) => bps && recipient !== AddressZero);

  // Fetch the current royalties
  const currentRoyalties = await idb.oneOrNone(
    `
      SELECT
        COALESCE(collections.new_royalties, '{}') AS royalties
      FROM collections
      WHERE collections.id = $/collection/
    `,
    { collection }
  );

  if (currentRoyalties) {
    // Always keep the latest royalty per spec
    if (!_.isEqual(currentRoyalties.royalties[spec], royalties)) {
      currentRoyalties.royalties[spec] = royalties;

      await idb.none(
        `
          UPDATE collections
          SET new_royalties = $/royalties:json/
          WHERE collections.id = $/collection/
        `,
        {
          collection,
          royalties: currentRoyalties.royalties,
        }
      );
    }
  }
};

// At the moment we support: custom, opensea and royalty registry specs
export const refreshAllRoyaltySpecs = async (
  collection: string,
  customRoyalties: Royalty[],
  openseaRoyalties: Royalty[]
) => {
  // Update custom royalties
  await updateRoyaltySpec(collection, "custom", customRoyalties);

  // Update opensea royalties
  await updateRoyaltySpec(collection, "opensea", openseaRoyalties);

  // Refresh the on-chain royalties
  await registry.refreshRegistryRoyalties(collection);
};

// The default royalties are represented by the max royalties across all royalty specs
export const refreshDefaulRoyalties = async (collection: string) => {
  const royaltiesResult = await idb.oneOrNone(
    `
      SELECT
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

  let defultRoyalties: Royalty[] = [];
  let currentTotalBps = 0;
  for (const kind of Object.keys(royaltiesResult.new_royalties || {})) {
    const newRoyaltiesTotalBps = getTotalRoyaltyBps(royaltiesResult.new_royalties[kind]);
    if (newRoyaltiesTotalBps > currentTotalBps) {
      defultRoyalties = royaltiesResult.new_royalties[kind];
      currentTotalBps = newRoyaltiesTotalBps;
    }
  }

  const royaltiesBpsSum = _.sumBy(defultRoyalties, (royalty) => royalty.bps);

  await idb.none(
    `
      UPDATE collections SET
        royalties = $/royalties:json/, royalties_bps = $/royaltiesBpsSum/
      WHERE collections.id = $/id/
    `,
    {
      id: collection,
      royalties: defultRoyalties,
      royaltiesBpsSum,
    }
  );
};
