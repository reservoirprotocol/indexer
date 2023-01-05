import { Interface } from "@ethersproject/abi";
import { Contract } from "@ethersproject/contracts";
import * as Sdk from "@reservoir0x/sdk";

import { baseProvider } from "@/common/provider";
import { bn, fromBuffer } from "@/common/utils";
import { config } from "@/config/index";
import { idb } from "@/common/db";
import { Royalty, updateRoyaltySpec } from "@/utils/royalties";

const DEFAULT_PRICE = "1000000000000000000";

// Assume there are no per-token royalties but everything is per-contract
export const refreshRegistryRoyalties = async (
  collection: string
): Promise<Royalty[] | undefined> => {
  // Fetch the collection's contract
  const collectionResult = await idb.oneOrNone(
    `
      SELECT
        collections.contract
      FROM collections
      WHERE collections.id = $/collection/
    `,
    { collection }
  );
  if (!collectionResult?.contract) {
    return undefined;
  }

  // Fetch a random token from the collection
  const tokenResult = await idb.oneOrNone(
    `
      SELECT
        tokens.token_id
      FROM tokens
      WHERE tokens.collection_id = $/collection/
      LIMIT 1
    `,
    { collection }
  );
  if (!tokenResult?.token_id) {
    return undefined;
  }

  const token = fromBuffer(collectionResult.contract);
  const tokenId = tokenResult.token_id;

  if (Sdk.Common.Addresses.RoyaltyEngine[config.chainId]) {
    const royaltyEngine = new Contract(
      Sdk.Common.Addresses.RoyaltyEngine[config.chainId],
      new Interface([
        `
          function getRoyaltyView(
            address token,
            uint256 tokenId,
            uint256 value
          ) external view returns (
            address[] recipients,
            uint256[] amounts
          )
        `,
      ]),
      baseProvider
    );

    try {
      // The royalties are returned in full amounts, but we store them as a percentage
      // so here we just use a default price (which is a round number) and deduce then
      // deduce the percentage taken as royalties from that
      const { recipients, amounts } = await royaltyEngine.getRoyaltyView(
        token,
        tokenId,
        DEFAULT_PRICE
      );

      const latestRoyalties: Royalty[] = [];
      for (let i = 0; i < amounts.length; i++) {
        const recipient = recipients[i].toLowerCase();
        const amount = amounts[i];
        if (bn(amount).gte(DEFAULT_PRICE)) {
          throw new Error("Royalty exceeds price");
        }

        const bps = Math.round(bn(amount).mul(10000).div(DEFAULT_PRICE).toNumber());
        latestRoyalties.push({ recipient, bps });
      }

      // Save the retrieved royalty spec
      await updateRoyaltySpec(collection, "onchain", latestRoyalties);

      return latestRoyalties;
    } catch {
      return undefined;
    }
  }
};
