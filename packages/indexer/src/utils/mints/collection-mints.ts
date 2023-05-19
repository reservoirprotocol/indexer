import { defaultAbiCoder } from "@ethersproject/abi";
import { JsonRpcProvider } from "@ethersproject/providers";
import { getCallTrace, getStateChange } from "@georgeroman/evm-tx-simulator";
import { TxData } from "@reservoir0x/sdk/src/utils";

import { idb } from "@/common/db";
import { logger } from "@/common/logger";
import { bn, fromBuffer, toBuffer } from "@/common/utils";
import { config } from "@/config/index";

export type MintDetails =
  | {
      kind: "empty";
      methodSignature: string;
      methodParams: string;
    }
  | {
      kind: "numeric";
      methodSignature: string;
      methodParams: string;
    }
  | {
      kind: "address";
      methodSignature: string;
      methodParams: string;
    }
  | {
      kind: "numeric-address";
      methodSignature: string;
      methodParams: string;
    }
  | {
      kind: "address-numeric";
      methodSignature: string;
      methodParams: string;
    };

export const getMintTxData = (
  details: MintDetails,
  minter: string,
  contract: string,
  quantity: number,
  price: string
): TxData => {
  const params = details.methodParams.split(",");
  logger.info("mints-process", JSON.stringify({ params, minter, quantity }));

  let calldata: string | undefined;
  switch (details.kind) {
    case "empty":
      calldata = details.methodSignature;
      break;

    case "numeric":
      calldata = details.methodSignature + defaultAbiCoder.encode(params, [quantity]);
      break;

    case "address":
      calldata = details.methodSignature + defaultAbiCoder.encode(params, [minter]);
      break;

    case "numeric-address":
      calldata = details.methodSignature + defaultAbiCoder.encode(params, [quantity, minter]);
      break;

    case "address-numeric":
      calldata = details.methodSignature + defaultAbiCoder.encode(params, [minter, quantity]);
      break;
  }

  logger.info("mints-process", JSON.stringify({ calldata }));

  if (!calldata) {
    throw new Error("Mint not supported");
  }

  return {
    from: minter,
    to: contract,
    data: calldata,
    value: bn(price).mul(quantity).toHexString(),
  };
};

export type CollectionMint = {
  collection: string;
  kind: "public";
  status: "open" | "closed";
  details: MintDetails;
  currency: string;
  price: string;
};

export const simulateAndSaveCollectionMint = async (collectionMint: CollectionMint) => {
  // Fetch the collection's contract and kind
  const collectionResult = await idb.oneOrNone(
    `
      SELECT
        collections.contract,
        contracts.kind
      FROM collections
      WHERE collections.id = $/collection/
    `,
    { collection: collectionMint.collection }
  );

  // Generate the calldata for minting
  const minter = "0x0000000000000000000000000000000000000001";
  const contract = fromBuffer(collectionResult.contract);
  const quantity = 1;
  const price = collectionMint.price;
  const contractKind = collectionResult.kind;
  const txData = getMintTxData(collectionMint.details, minter, contract, quantity, price);

  // Simulate the mint
  // TODO: Binary search for the maximum quantity per wallet
  const success = await simulateMint(minter, contract, quantity, price, txData.data, contractKind);

  if (success) {
    await idb.none(
      `
        INSERT INTO collection_mints (
          collection_id,
          kind,
          status,
          details,
          currency,
          price
        ) VALUES (
          $/collection/,
          $/kind/,
          $/status/,
          $/details:json/,
          $/currency/,
          $/price/
        ) ON CONFLICT DO NOTHING
      `,
      {
        collection: collectionMint.collection,
        kind: collectionMint.kind,
        status: collectionMint.status,
        details: collectionMint.details,
        currency: toBuffer(collectionMint.currency),
        price: collectionMint.price,
      }
    );
  }

  return success;
};

const simulateMint = async (
  minter: string,
  contract: string,
  quantity: number,
  price: string,
  calldata: string,
  contractKind: "erc721" | "erc1155"
) => {
  const value = bn(price).mul(quantity);

  const provider = new JsonRpcProvider(config.traceNetworkHttpUrl);
  const callTrace = await getCallTrace(
    {
      from: minter,
      to: contract,
      data: calldata,
      value,
      gas: 10000000,
      gasPrice: 0,
      balanceOverrides: {
        [minter]: value,
      },
    },
    provider,
    { skipReverts: true }
  );
  if (callTrace.error) {
    return false;
  }

  const result = getStateChange(callTrace);

  let amountMinted = bn(0);
  for (const token of Object.keys(result[minter].tokenBalanceState)) {
    if (token.startsWith(`${contractKind}:${contract}`)) {
      amountMinted = bn(amountMinted).add(result[minter].tokenBalanceState[token]);
    }
  }

  if (amountMinted.eq(quantity)) {
    return true;
  }

  return false;
};
