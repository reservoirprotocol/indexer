import { ParamType } from "@ethersproject/abi";
import { BigNumber } from "@ethersproject/bignumber";
import { AddressZero, HashZero } from "@ethersproject/constants";
import * as Sdk from "@reservoir0x/sdk";

import { idb } from "@/common/db";
import { logger } from "@/common/logger";
import { bn, toBuffer, fromBuffer } from "@/common/utils";
import { config } from "@/config/index";
import * as utils from "@/events-sync/utils";
import { Transaction } from "@/models/transactions";
import {
  CollectionMint,
  getCollectionMints,
  simulateAndUpsertCollectionMint,
} from "@/orderbook/mints";
import { AbiParam } from "@/orderbook/mints/calldata";
import { getMaxSupply } from "@/orderbook/mints/calldata/helpers";
import { getMethodSignature, MethodSignature } from "@/orderbook/mints/method-signatures";

const STANDARD = "unknown";

const isEmptyOrZero = (array: string[], emptyValue: string) =>
  !array.length || array.every((i) => i === emptyValue);

const isComplexParam = (abiType: string) => {
  const complexKeywords = ["(", ")", "[", "]", "bytes", "tuple"];
  return complexKeywords.some((c) => abiType.includes(c));
};

const getSampleMintTxs = async (contract: string) => {
  // TODO: For better accuracy we should use the latest mint transactions
  const mintTxHashes = await idb
    .manyOrNone(
      `
        SELECT
          DISTINCT(nft_transfer_events.tx_hash) AS tx_hash
        FROM nft_transfer_events
        WHERE nft_transfer_events.address = $/contract/
          AND nft_transfer_events.from = $/from/
        LIMIT 15
      `,
      {
        contract: toBuffer(contract),
        from: toBuffer(AddressZero),
      }
    )
    .then((rs) =>
      rs.map((r) => ({
        txHash: fromBuffer(r.tx_hash),
      }))
    );

  return Promise.all(mintTxHashes.map((c) => utils.fetchTransaction(c.txHash)));
};

const getConstantParams = async (methodSignature: MethodSignature, sampleTxs: Transaction[]) => {
  // Guess possible constant params by statistics from a sample of mint transactions
  const constantParamsIndexes: number[] = [];

  const parsedMethodSignatures: MethodSignature[] = [];
  for (const sampleTx of sampleTxs) {
    const parsedMethodSignature = await getMethodSignature(sampleTx.data);
    if (parsedMethodSignature && parsedMethodSignature.signature === methodSignature.signature) {
      parsedMethodSignatures.push(parsedMethodSignature);
    }
  }

  // Sample data is too small
  if (parsedMethodSignatures.length < 2) {
    return constantParamsIndexes;
  }

  const valueStats: Map<string, number> = new Map();
  for (const parsedMethodSignature of parsedMethodSignatures) {
    parsedMethodSignature.inputs.forEach((_, i) => {
      const decodedValue = parsedMethodSignature.decodedCalldata[i].toString();

      const key = `param:${i}:${decodedValue}`;
      const count = valueStats.get(key);
      if (count) {
        valueStats.set(key, count + 1);
      } else {
        valueStats.set(key, 1);
      }
    });
  }

  const sampleSize = sampleTxs.length;
  // At least 80% of the sample transactions should have the same value
  // for a given parameter in order to consider that parameter constant
  const threshold = 80;

  methodSignature.inputs.forEach((abi, i) => {
    const complexParam = isComplexParam(abi.type!);
    const decodedValue = methodSignature.decodedCalldata[i].toString();

    if (complexParam) {
      const key = `param:${i}:${decodedValue}`;
      const count = valueStats.get(key);
      if (count) {
        const percent = (count * 100) / sampleSize;
        if (percent > threshold) {
          constantParamsIndexes.push(i);
        }
      }
    }
  });

  return constantParamsIndexes;
};

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

  const parsedParams = methodSignature.inputs.map((c) => c.type!);
  const hasComplexParams = parsedParams.some((abiType) => isComplexParam(abiType));

  let emptyOrZero = false;
  let constantParamsIndexes: number[] = [];

  // If we have "complex" params then we require them to either:
  // - default / zero values
  // - constant values (across a random list of mint transactions)
  if (hasComplexParams) {
    parsedParams.forEach((abiType, i) => {
      const decodedValue = methodSignature.decodedCalldata[i];

      const complexParam = isComplexParam(abiType);
      if (complexParam && abiType.includes("tuple")) {
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
      const sampleMintTxs = await getSampleMintTxs(collection);
      if (sampleMintTxs.length) {
        constantParamsIndexes = await getConstantParams(methodSignature, sampleMintTxs);
      }
    }

    if (!emptyOrZero && constantParamsIndexes.length === 0) {
      return [];
    }
  }

  const params: AbiParam[] = [];

  try {
    if (methodSignature.params.length) {
      parsedParams.forEach((abiType, i) => {
        const decodedValue = methodSignature.decodedCalldata[i];

        const complexParam = isComplexParam(abiType);
        const constantParam = constantParamsIndexes.some((cpi) => cpi === i);

        if (
          abiType.includes("int") &&
          (complexParam
            ? decodedValue.length === 1 && bn(decodedValue[0]).eq(amountMinted)
            : bn(decodedValue).eq(amountMinted))
        ) {
          params.push({
            kind: "quantity",
            abiType,
          });
        } else if (
          abiType.includes("address") &&
          (complexParam
            ? decodedValue.length === 1 && decodedValue[0].toLowerCase() === collection
            : decodedValue.toLowerCase() === collection)
        ) {
          params.push({
            kind: "contract",
            abiType,
          });
        } else if (
          abiType.includes("address") &&
          (complexParam
            ? decodedValue.length === 1 && decodedValue[0].toLowerCase() === tx.from
            : decodedValue.toLowerCase() === tx.from)
        ) {
          params.push({
            kind: "recipient",
            abiType,
          });
        } else if (constantParam || abiType.includes("tuple") || abiType.includes("[]")) {
          params.push({
            kind: "unknown",
            abiType: ParamType.fromObject(methodSignature.inputs[i]).format(),
            abiValue: decodedValue,
          });
        } else {
          params.push({
            kind: "unknown",
            abiType,
            abiValue: decodedValue,
          });
        }
      });
    }
  } catch (error) {
    logger.error("mint-detector", JSON.stringify({ kind: STANDARD, error }));
  }

  if (params.length !== parsedParams.length) {
    return [];
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
