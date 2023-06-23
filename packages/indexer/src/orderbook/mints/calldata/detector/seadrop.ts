import { Interface } from "@ethersproject/abi";
import { Contract } from "@ethersproject/contracts";
import * as Sdk from "@reservoir0x/sdk";

import { logger } from "@/common/logger";
import { baseProvider } from "@/common/provider";
import { now } from "@/common/utils";
import { config } from "@/config/index";
import { Transaction } from "@/models/transactions";
import { CollectionMint } from "@/orderbook/mints";
import { getMaxSupply } from "@/orderbook/mints/calldata/helpers";

export const extractByTx = async (
  collection: string,
  contract: string,
  tx: Transaction
): Promise<CollectionMint[]> => {
  if (
    [
      "0x161ac21f", // `mintPublic`
    ].some((bytes4) => tx.data.startsWith(bytes4))
  ) {
    try {
      const c = new Contract(
        tx.to,
        new Interface([
          `
            function mintPublic(
              address nftContract,
              address feeRecipient,
              address minterIfNotPayer,
              uint256 quantity
            )
          `,
          `
            function getPublicDrop(address nftContract) view returns (
              (
                uint80 mintPrice,
                uint48 startTime,
                uint48 endTime,
                uint16 maxTotalMintableByWallet,
                uint16 feeBps,
                bool restrictFeeRecipients
              )
            )
          `,
        ]),
        baseProvider
      );

      const drop = await c.getPublicDrop(contract);
      if (drop.startTime && drop.endTime && drop.startTime <= now()) {
        return [
          {
            collection,
            contract,
            stage: "public-sale",
            kind: "public",
            status: "open",
            standard: "seadrop-v1.0",
            details: {
              tx: {
                to: tx.to,
                data: {
                  // `mintPublic`
                  signature: "0x161ac21f",
                  params: [
                    {
                      kind: "contract",
                      abiType: "address",
                    },
                    {
                      kind: "unknown",
                      abiType: "address",
                      abiValue: c.interface
                        .decodeFunctionData("mintPublic", tx.data)
                        .feeRecipient.toLowerCase(),
                    },
                    {
                      kind: "recipient",
                      abiType: "address",
                    },
                    {
                      kind: "quantity",
                      abiType: "uint256",
                    },
                  ],
                },
              },
            },
            currency: Sdk.Common.Addresses.Eth[config.chainId],
            price: drop.mintPrice.toString(),
            maxMintsPerWallet: String(drop.maxTotalMintableByWallet),
            maxSupply: await getMaxSupply(contract),
            startTime: drop.startTime,
            endTime: drop.endTime,
          },
        ];
      }
    } catch (error) {
      logger.error("mint-detector", JSON.stringify({ kind: "seadrop-v1.0", error }));
    }
  }

  return [];
};
