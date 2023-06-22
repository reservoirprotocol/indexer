import { Interface } from "@ethersproject/abi";
import { BigNumber } from "@ethersproject/bignumber";
import { Contract } from "@ethersproject/contracts";
import * as Sdk from "@reservoir0x/sdk";
import axios from "axios";

import { logger } from "@/common/logger";
import { baseProvider } from "@/common/provider";
import { bn, now } from "@/common/utils";
import { config } from "@/config/index";
import { Transaction } from "@/models/transactions";
import { CollectionMint } from "@/orderbook/mints";
import { AllowlistItem, createAllowlist } from "@/orderbook/mints/allowlists";

export type Info = {
  merkleRoot: string;
};

export const tryParseCollectionMint = async (
  collection: string,
  tx: Transaction
): Promise<CollectionMint | undefined> => {
  const c = new Contract(
    tx.to,
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
      "function zoraFeeForAmount(uint256 quantity) view returns (address recipient, uint256 fee)",
    ]),
    baseProvider
  );

  // Public mints
  if (
    [
      "0xefef39a1", // `purchase`
      "0x03ee2733", // `purchaseWithComment`
    ].some((bytes4) => tx.data.startsWith(bytes4))
  ) {
    try {
      const saleDetails = await c.saleDetails();
      if (saleDetails.publicSaleActive && saleDetails.publicSaleStart.toNumber() <= now()) {
        // Include the Zora mint fee into the price
        const fee = await c.zoraFeeForAmount(1).then((f: { fee: BigNumber }) => f.fee);
        const price = bn(saleDetails.publicSalePrice).add(fee).toString();

        return {
          collection,
          stage: "public-sale",
          kind: "public",
          status: "open",
          standard: "zora",
          details: {
            tx: {
              to: tx.to,
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
          price,
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

  // Allowlist mints
  if (
    [
      "0x25024a2b", // `purchasePresale`
      "0x2e706b5a", // `purchasePresaleWithComment`
    ].some((bytes4) => tx.data.startsWith(bytes4))
  ) {
    try {
      const saleDetails = await c.saleDetails();
      if (saleDetails.presaleActive && saleDetails.presaleStart.toNumber() <= now()) {
        const merkleRoot = c.presaleMerkleRoot;
        const allowlistItems = await axios
          .get(`https://allowlist.zora.co/allowlist/${merkleRoot}`)
          .then(({ data }) => data)
          .then((data: { entries: { user: string; price: string; maxCanMint: number }[] }) =>
            data.entries.map(
              (e) =>
                ({
                  address: e.user,
                  price: e.price,
                  maxMints: String(e.maxCanMint),
                } as AllowlistItem)
            )
          );

        if (
          !allowlistItems.every(
            (item) =>
              item.maxMints === allowlistItems[0].maxMints && item.price === allowlistItems[0].price
          )
        ) {
          throw new Error("Only same item allowlists are supported");
        }

        await createAllowlist(merkleRoot, allowlistItems);

        // Include the Zora mint fee into the price
        const fee = await c.zoraFeeForAmount(1).then((f: { fee: BigNumber }) => f.fee);
        const price = bn(allowlistItems[0].price!).add(fee).toString();

        return {
          collection,
          stage: "presale",
          kind: "allowlist",
          status: "open",
          standard: "zora",
          details: {
            tx: {
              to: tx.to,
              data: {
                // `purchasePresale`
                signature: "0x25024a2b",
                params: [
                  {
                    kind: "quantity",
                    abiType: "uint256",
                  },
                  {
                    kind: "unknown",
                    abiType: "uint256",
                    abiValue: allowlistItems[0].maxMints,
                  },
                  {
                    kind: "unknown",
                    abiType: "uint256",
                    abiValue: allowlistItems[0].price,
                  },
                  {
                    kind: "allowlist-proof",
                    abiType: "bytes32[]",
                  },
                ],
              },
            },
          },
          currency: Sdk.Common.Addresses.Eth[config.chainId],
          price,
          maxMintsPerWallet: allowlistItems[0].maxMints!.toString(),
          maxSupply: saleDetails.maxSupply.toString(),
          startTime: saleDetails.presaleStart.toNumber(),
          endTime: saleDetails.presaleEnd.toNumber(),
        };
      }
    } catch (error) {
      logger.error("mint-detector", JSON.stringify({ kind: "zora", error }));
    }
  }

  return undefined;
};
