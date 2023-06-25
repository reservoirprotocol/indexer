import { Interface } from "@ethersproject/abi";
import { HashZero } from "@ethersproject/constants";
import { Contract } from "@ethersproject/contracts";
import * as Sdk from "@reservoir0x/sdk";

import { logger } from "@/common/logger";
import { baseProvider } from "@/common/provider";
import { bn, now } from "@/common/utils";
import { config } from "@/config/index";
import { Transaction } from "@/models/transactions";
import { CollectionMint } from "@/orderbook/mints";

export const extractByTx = async (
  collection: string,
  tx: Transaction
): Promise<CollectionMint[]> => {
  if (
    [
      "0xfa2b068f", // `mint`
      "0x26c858a4", // `mintBatch`
    ].some((bytes4) => tx.data.startsWith(bytes4))
  ) {
    try {
      const c = new Contract(
        tx.to,
        new Interface([
          `
            function mint(
              address creatorContractAddress,
              uint256 instanceId,
              uint32 mintIndex,
              bytes32[] merkleProof,
              address mintFor
            )
          `,
          `
            function mintBatch(
              address creatorContractAddress,
              uint256 instanceId,
              uint16 mintCount,
              uint32[] calldata mintIndices,
              bytes32[][] calldata merkleProofs,
              address mintFor
            )
          `,
          `
            function getClaim(address creatorContractAddress, uint256 instanceId) view returns (
              (
                uint32 total,
                uint32 totalMax,
                uint32 walletMax,
                uint48 startDate,
                uint48 endDate,
                uint8 storageProtocol,
                bytes32 merkleRoot,
                string location,
                uint256 tokenId,
                uint256 cost,
                address payable paymentReceiver,
                address erc20
              )
            )
          `,
          "function MINT_FEE() view returns (uint256)",
        ]),
        baseProvider
      );

      const decodedTxData = c.interface.decodeFunctionData(
        tx.data.startsWith("0xfa2b068f") ? "mint" : "mintBatch",
        tx.data
      );
      const claim = await c.getClaim(
        decodedTxData.creatorContractAddress,
        decodedTxData.instanceId
      );
      if (
        claim.merkleRoot === HashZero &&
        claim.erc20.toLowerCase() === Sdk.Common.Addresses.Eth[config.chainId] &&
        (claim.startDate ? claim.startDate <= now() : true)
      ) {
        // Include the Manifold mint fee into the price
        const fee = await c.MINT_FEE();
        const price = bn(claim.cost).add(fee).toString();

        return [
          {
            collection,
            contract: decodedTxData.creatorContractAddress.toLowerCase(),
            stage: "public-sale",
            kind: "public",
            status: "open",
            standard: "manifold",
            details: {
              tx: {
                to: tx.to,
                data: {
                  // `mintBatch`
                  signature: "0x26c858a4",
                  params: [
                    {
                      kind: "contract",
                      abiType: "address",
                    },
                    {
                      kind: "unknown",
                      abiType: "uint256",
                      abiValue: decodedTxData.instanceId.toString(),
                    },
                    {
                      kind: "quantity",
                      abiType: "uint16",
                    },
                    {
                      kind: "unknown",
                      abiType: "uint32[]",
                      abiValue: [],
                    },
                    {
                      kind: "unknown",
                      abiType: "bytes32[][]",
                      abiValue: [],
                    },

                    {
                      kind: "recipient",
                      abiType: "address",
                    },
                  ],
                },
              },
            },
            currency: Sdk.Common.Addresses.Eth[config.chainId],
            price,
            tokenId: claim.tokenId.toString(),
            maxMintsPerWallet: bn(claim.walletMax).eq(0) ? null : claim.walletMax.toString(),
            maxSupply: bn(claim.totalMax).eq(0) ? null : claim.totalMax.toString(),
            startTime: claim.startDate ? claim.startDate : null,
            endTime: claim.endDate ? claim.endDate : null,
          },
        ];
      }
    } catch (error) {
      logger.error("mint-detector", JSON.stringify({ kind: "manifold", error }));
    }
  }

  return [];
};
