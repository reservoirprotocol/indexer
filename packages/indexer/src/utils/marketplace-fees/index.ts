import { AddressZero } from "@ethersproject/constants";
import _ from "lodash";

import { idb } from "@/common/db";
import { Tokens } from "@/models/tokens";
import { tryGetCollectionOpenseaFees } from "@/utils/opensea";

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

export const getCollectionOpenseaFees = async (collection: string, contract: string) => {
  const openseaMarketplaceFees: MarketPlaceFee[] = [];

  const tokenId = await Tokens.getSingleToken(collection);
  const tryGetCollectionOpenseaFeesResult = await tryGetCollectionOpenseaFees(contract, tokenId);

  if (tryGetCollectionOpenseaFeesResult.isSuccess) {
    const openseaFees = tryGetCollectionOpenseaFeesResult.openseaFees;

    for (const [feeRecipient, feeBps] of Object.entries(openseaFees)) {
      openseaMarketplaceFees.push({ recipient: feeRecipient, bps: feeBps });
    }

    await updateMarketplaceFeeSpec(
      collection,
      "opensea",
      openseaMarketplaceFees as MarketPlaceFee[]
    );
  } else {
    openseaMarketplaceFees.push({
      recipient: "0x0000a26b00c1f0df003000390027140000faa719",
      bps: 250,
    });
  }

  return openseaMarketplaceFees;
};
