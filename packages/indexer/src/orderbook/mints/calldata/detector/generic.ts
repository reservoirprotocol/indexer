import { BigNumber } from "@ethersproject/bignumber";
import * as Sdk from "@reservoir0x/sdk";

import { logger } from "@/common/logger";
import { bn } from "@/common/utils";
import { config } from "@/config/index";
import { Transaction } from "@/models/transactions";
import {
  CollectionMint,
  getCollectionMints,
  simulateAndUpsertCollectionMint,
} from "@/orderbook/mints";
import { AbiParam } from "@/orderbook/mints/calldata";
import { getMaxSupply } from "@/orderbook/mints/calldata/helpers";
import { getMethodSignature } from "@/orderbook/mints/method-signatures";

export const extractByTx = async (
  collection: string,
  contract: string,
  tx: Transaction,
  pricePerAmountMinted: BigNumber,
  amountMinted: BigNumber
): Promise<CollectionMint[]> => {
  const maxSupply = await getMaxSupply(contract);

  if (tx.data.length === 10) {
    return [
      {
        collection,
        contract,
        stage: "public-sale",
        kind: "public",
        status: "open",
        standard: "unknown",
        details: {
          tx: {
            to: tx.to,
            data: {
              signature: tx.data,
              params: [],
            },
          },
        },
        currency: Sdk.Common.Addresses.Eth[config.chainId],
        price: pricePerAmountMinted.toString(),
        maxSupply,
      },
    ];
  }

  // Try to get the method signature from the calldata
  const methodSignature = await getMethodSignature(tx.data);
  if (!methodSignature) {
    return [];
  }

  // For now, we only support simple data types in the calldata
  if (["(", ")", "[", "]", "bytes"].some((x) => methodSignature.params.includes(x))) {
    return [];
  }

  const params: AbiParam[] = [];

  try {
    methodSignature.params.split(",").forEach((abiType, i) => {
      const decodedValue = methodSignature.decodedCalldata[i];

      if (abiType.includes("int") && bn(decodedValue).eq(amountMinted)) {
        params.push({
          kind: "quantity",
          abiType,
        });
      } else if (abiType.includes("address") && decodedValue.toLowerCase() === contract) {
        params.push({
          kind: "contract",
          abiType,
        });
      } else if (abiType.includes("address") && decodedValue.toLowerCase() === tx.from) {
        params.push({
          kind: "recipient",
          abiType,
        });
      } else {
        params.push({
          kind: "unknown",
          abiType,
          abiValue: decodedValue.toString().toLowerCase(),
        });
      }
    });
  } catch (error) {
    logger.error("mint-detector", JSON.stringify({ kind: "generic", error }));
  }

  return [
    {
      collection,
      contract,
      stage: "public-sale",
      kind: "public",
      status: "open",
      standard: "unknown",
      details: {
        tx: {
          to: tx.to,
          data: {
            signature: methodSignature.signature,
            params,
          },
        },
      },
      currency: Sdk.Common.Addresses.Eth[config.chainId],
      price: pricePerAmountMinted.toString(),
      maxSupply,
    },
  ];
};

export const refreshByCollection = async (collection: string) => {
  const existingCollectionMints = await getCollectionMints(collection, { standard: "unknown" });

  // TODO: We should look into re-detecting and updating any fields that
  // could have changed on the mint since the initial detection
  for (const collectionMint of existingCollectionMints) {
    await simulateAndUpsertCollectionMint(collectionMint);
  }
};
