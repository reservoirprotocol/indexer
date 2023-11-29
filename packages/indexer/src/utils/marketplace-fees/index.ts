import { AddressZero } from "@ethersproject/constants";
import _ from "lodash";

import { idb } from "@/common/db";

export type MarketPlaceFee = {
  recipient: string;
  bps: number;
};

export const updateMarketplaceFeeSpec = async (
  collection: string,
  spec: string,
  marketplaceFees?: MarketPlaceFee[]
) => {
  // For safety, skip any zero bps or recipients
  marketplaceFees = marketplaceFees
    ? marketplaceFees.filter(({ bps, recipient }) => bps && recipient !== AddressZero)
    : undefined;

  // Fetch the current royalties
  const currentMarketplaceFees = await idb.oneOrNone(
    `
      SELECT
        COALESCE(collections.marketplace_fees, '{}') AS marketplace_fees
      FROM collections
      WHERE collections.id = $/collection/
    `,
    { collection }
  );

  if (currentMarketplaceFees) {
    // Always keep the latest royalty per spec
    if (
      !_.isEqual(currentMarketplaceFees.marketplace_fees[spec], marketplaceFees) ||
      !(spec in currentMarketplaceFees.marketplace_fees)
    ) {
      currentMarketplaceFees.marketplace_fees[spec] = marketplaceFees;

      await idb.none(
        `
          UPDATE collections
            SET marketplace_fees = $/marketplaceFees:json/,
                updated_at = NOW()
          WHERE collections.id = $/collection/
          AND (
            collections.marketplace_fees IS DISTINCT FROM $/marketplaceFees:json/
          )
        `,
        {
          collection,
          marketplaceFees: currentMarketplaceFees.marketplace_fees,
        }
      );
    }
  }
};

export const getCollectionOpenseaFees = () => {
  return [
    {
      recipient: "0x0000a26b00c1f0df003000390027140000faa719",
      bps: 250,
    },
  ];
};
