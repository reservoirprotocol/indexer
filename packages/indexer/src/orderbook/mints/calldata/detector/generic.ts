import { ParamType } from "@ethersproject/abi";
import { BigNumber } from "@ethersproject/bignumber";
import { HashZero } from "@ethersproject/constants";
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

const STANDARD = "unknown";

const isEmptyOrZero = (array: string[], emptyValue: string) =>
  !array.length || array.every((i) => i === emptyValue);

export const extractByTx = async (
  collection: string,
  tx: Transaction,
  pricePerAmountMinted: BigNumber,
  amountMinted: BigNumber
): Promise<CollectionMint[]> => {
  const maxSupply = await getMaxSupply(collection);

  if (tx.data.length === 10) {
    return [
      {
        collection,
        contract: collection,
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
        currency: Sdk.Common.Addresses.Native[config.chainId],
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

  // Support complex types as long as they're empty or contain "zero" values
  const complexKeywords = ["(", ")", "[", "]", "bytes", "tuple"];

  const parsedParams = methodSignature.inputs.map((c) => c.type!);
  const hasComplexParams = parsedParams.some((abiType) =>
    complexKeywords.some((x) => abiType.includes(x))
  );

  let emptyOrZero = false;
  if (hasComplexParams) {
    parsedParams.forEach((abiType, i) => {
      const decodedValue = methodSignature.decodedCalldata[i];

      const isComplexParam = complexKeywords.some((c) => abiType.includes(c));
      if (isComplexParam && abiType.includes("tuple")) {
        const subParams = methodSignature.inputs[i].components!;

        emptyOrZero = subParams.every((param, i) => {
          const value = decodedValue[i];
          if (param.type === "bytes32") {
            return value === HashZero;
          } else if (param.type === "bytes32[]") {
            return isEmptyOrZero(value, HashZero);
          }
          return false;
        });
      } else if (abiType.includes("bytes32[]")) {
        emptyOrZero = isEmptyOrZero(decodedValue, HashZero);
      }
    });

    if (!emptyOrZero) {
      return [];
    }
  }

  const params: AbiParam[] = [];

  try {
    if (methodSignature.params.length) {
      parsedParams.forEach((abiType, i) => {
        const decodedValue = methodSignature.decodedCalldata[i];
        if (abiType.includes("int") && bn(decodedValue).eq(amountMinted)) {
          params.push({
            kind: "quantity",
            abiType,
          });
        } else if (abiType.includes("address") && decodedValue.toLowerCase() === collection) {
          params.push({
            kind: "contract",
            abiType,
          });
        } else if (abiType.includes("address") && decodedValue.toLowerCase() === tx.from) {
          params.push({
            kind: "recipient",
            abiType,
          });
        } else if (abiType.includes("tuple") || abiType.includes("[]")) {
          params.push({
            kind: "unknown",
            abiType: ParamType.fromObject(methodSignature.inputs[i]).format(),
            abiValue: decodedValue,
          });
        } else {
          params.push({
            kind: "unknown",
            abiType,
            abiValue: decodedValue.toString().toLowerCase(),
          });
        }
      });
    }
  } catch (error) {
    logger.error("mint-detector", JSON.stringify({ kind: STANDARD, error }));
  }

  const collectionMint: CollectionMint = {
    collection,
    contract: collection,
    stage: "public-sale",
    kind: "public",
    status: "open",
    standard: STANDARD,
    details: {
      tx: {
        to: tx.to,
        data: {
          signature: methodSignature.signature,
          params,
        },
      },
    },
    currency: Sdk.Common.Addresses.Native[config.chainId],
    price: pricePerAmountMinted.toString(),
    maxSupply,
  };

  const results = [collectionMint];

  return results;
};

export const refreshByCollection = async (collection: string) => {
  const existingCollectionMints = await getCollectionMints(collection, { standard: STANDARD });

  // TODO: We should look into re-detecting and updating any fields that
  // could have changed on the mint since the initial detection
  for (const collectionMint of existingCollectionMints) {
    await simulateAndUpsertCollectionMint(collectionMint);
  }
};
