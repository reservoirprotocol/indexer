import { Interface } from "@ethersproject/abi";
import { Contract } from "@ethersproject/contracts";
import * as Sdk from "@reservoir0x/sdk";

import { logger } from "@/common/logger";
import { baseProvider } from "@/common/provider";
import { config } from "@/config/index";
import { Transaction } from "@/models/transactions";
import { CollectionMint } from "@/utils/mints/collection-mints";

export const tryParseCollectionMint = async (
  collection: string,
  contract: string,
  tx: Transaction
): Promise<CollectionMint | undefined> => {
  if (
    [
      "0xefef39a1", // `purchase`
      "0x03ee2733", // `purchaseWithComment`
    ].some((bytes4) => tx.data.startsWith(bytes4))
  ) {
    try {
      const c = new Contract(
        collection,
        new Interface([
          `
            function saleDetails() view returns (
              (
                bool publicSaleActive,
                bool presaleActive,
                uint256 publicSalePrice,
                uint64 publicSaleStart,
                uint64 publicSaleEnd,
                uint64 presaleStart,
                uint64 presaleEnd,
                bytes32 presaleMerkleRoot,
                uint256 maxSalePurchasePerAddress,
                uint256 totalMinted,
                uint256 maxSupply
              )
            )
          `,
        ]),
        baseProvider
      );

      const saleDetails = await c.saleDetails();
      if (saleDetails.publicSaleActive) {
        return {
          collection,
          stage: "public-sale",
          kind: "public",
          status: "open",
          standard: "zora",
          details: {
            tx: {
              to: contract,
              data: {
                // `purchase`
                signature: "0xefef39a1",
                params: [
                  {
                    kind: "quantity",
                    abiType: "uint256",
                  },
                ],
              },
            },
          },
          currency: Sdk.Common.Addresses.Eth[config.chainId],
          price: saleDetails.publicSalePrice.toString(),
          maxMintsPerWallet: saleDetails.maxSalePurchasePerAddress.toString(),
          maxSupply: saleDetails.maxSupply.toString(),
          startTime: saleDetails.publicSaleStart.toNumber(),
          endTime: saleDetails.publicSaleEnd.toNumber(),
        };
      }
    } catch (error) {
      logger.error("mint-detector", JSON.stringify({ kind: "zora", error }));
    }
  }

  return undefined;
};
