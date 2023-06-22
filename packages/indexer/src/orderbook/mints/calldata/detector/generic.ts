import { BigNumber } from "@ethersproject/bignumber";
import * as Sdk from "@reservoir0x/sdk";

import { logger } from "@/common/logger";
import { bn } from "@/common/utils";
import { config } from "@/config/index";
import { Transaction } from "@/models/transactions";
import { getMaxSupply } from "@/orderbook/mints/calldata/detector/helpers";
import { AbiParam, CollectionMint } from "@/orderbook/mints";
import { getMethodSignature } from "@/orderbook/mints/method-signatures";

export const tryParseCollectionMint = async (
  collection: string,
  contract: string,
  tx: Transaction,
  pricePerAmountMinted: BigNumber,
  amountMinted: BigNumber
): Promise<CollectionMint | undefined> => {
  const maxSupply = await getMaxSupply(contract);

  if (tx.data.length === 10) {
    return {
      collection,
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
    };
  }

  // Try to get the method signature from the calldata
  const methodSignature = await getMethodSignature(tx.data);
  if (!methodSignature) {
    return undefined;
  }

  // For now, we only support simple data types in the calldata
  if (["(", ")", "[", "]", "bytes"].some((x) => methodSignature.params.includes(x))) {
    return undefined;
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

  return {
    collection,
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
  };
};
