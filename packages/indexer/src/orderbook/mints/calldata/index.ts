import { defaultAbiCoder } from "@ethersproject/abi";
import { AddressZero } from "@ethersproject/constants";
import { TxData } from "@reservoir0x/sdk/dist/utils";

import { idb } from "@/common/db";
import { bn, fromBuffer, toBuffer } from "@/common/utils";
import { CollectionMint } from "@/orderbook/mints";
import { addToQueue } from "@/jobs/mints/process";

import * as Decent from "@/orderbook/mints/calldata/detector/decent";
import * as Generic from "@/orderbook/mints/calldata/detector/generic";
import * as Manifold from "@/orderbook/mints/calldata/detector/manifold";
import * as Seadrop from "@/orderbook/mints/calldata/detector/seadrop";
import * as Thirdweb from "@/orderbook/mints/calldata/detector/thirdweb";
import * as Zora from "@/orderbook/mints/calldata/detector/zora";

export type AbiParam =
  | {
      kind: "unknown";
      abiType: string;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      abiValue: any;
    }
  | {
      kind: "quantity";
      abiType: string;
    }
  | {
      kind: "recipient";
      abiType: string;
    }
  | {
      kind: "contract";
      abiType: string;
    }
  | {
      kind: "allowlist";
      abiType: string;
    };

export type MintTxSchema = {
  to: string;
  data: {
    signature: string;
    params: AbiParam[];
  };
};

export type CustomInfo = Manifold.Info;

export const generateCollectionMintTxData = async (
  collectionMint: CollectionMint,
  minter: string,
  quantity: number
): Promise<{ txData: TxData; price: string }> => {
  // For `allowlist` mints
  const allowlistData =
    collectionMint.kind === "allowlist"
      ? await idb.oneOrNone(
          `
            SELECT
              allowlists_items.max_mints,
              allowlists_items.price,
              allowlists_items.actual_price
            FROM collection_mints
            JOIN allowlists_items
              ON collection_mints.allowlist_id = allowlists_items.allowlist_id
            WHERE collection_mints.collection_id = $/collection/
              AND collection_mints.stage = $/stage/
              ${collectionMint.tokenId ? " AND collection_mints.token_id = $/tokenId/" : ""}
              AND allowlists_items.address = $/address/
          `,
          {
            collection: collectionMint.collection,
            stage: collectionMint.stage,
            tokenId: collectionMint.tokenId ?? null,
            address: toBuffer(minter),
          }
        )
      : undefined;
  let allowlistItemIndex = 0;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const abiData: { abiType: string; abiValue: any }[] = [];

  const tx = collectionMint.details.tx;
  for (const p of tx.data.params) {
    switch (p.kind) {
      case "contract": {
        abiData.push({
          abiType: p.abiType,
          abiValue: collectionMint.contract,
        });
        break;
      }

      case "quantity": {
        abiData.push({
          abiType: p.abiType,
          abiValue: quantity,
        });
        break;
      }

      case "recipient": {
        abiData.push({
          abiType: p.abiType,
          abiValue: minter,
        });
        break;
      }

      case "allowlist": {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let abiValue: any;

        switch (collectionMint.standard) {
          case "decent": {
            if (allowlistItemIndex === 0) {
              abiValue = allowlistData.max_mints;
            } else if (allowlistItemIndex === 1) {
              abiValue = allowlistData.price;
            } else {
              abiValue = await Decent.generateProofValue(collectionMint, minter);
            }

            break;
          }

          case "manifold": {
            if (allowlistItemIndex === 0) {
              abiValue = [(await Manifold.generateProofValue(collectionMint, minter)).value];
            } else {
              abiValue = [(await Manifold.generateProofValue(collectionMint, minter)).merkleProof];
            }

            break;
          }

          case "thirdweb": {
            if (allowlistItemIndex === 0) {
              abiValue = allowlistData.price ?? collectionMint.price;
            } else {
              abiValue = await Thirdweb.generateProofValue(collectionMint, minter);
            }

            break;
          }

          case "zora": {
            if (allowlistItemIndex === 0) {
              abiValue = allowlistData.max_mints;
            } else if (allowlistItemIndex === 1) {
              abiValue = allowlistData.price;
            } else {
              abiValue = await Zora.generateProofValue(collectionMint, minter);
            }

            break;
          }

          default: {
            throw new Error("Allowlist fields not supported");
          }
        }

        // We use the relative index of the `allowlist` parameter to determine the current value
        allowlistItemIndex++;

        abiData.push({
          abiType: p.abiType,
          abiValue,
        });
        break;
      }

      default: {
        abiData.push({
          abiType: p.abiType,
          abiValue: p.abiValue,
        });
        break;
      }
    }
  }

  const data =
    tx.data.signature +
    (abiData.length
      ? defaultAbiCoder
          .encode(
            abiData.map(({ abiType }) => abiType),
            abiData.map(({ abiValue }) => abiValue)
          )
          .slice(2)
      : "");

  let price = collectionMint.price;
  if (!price) {
    // If the price is not available on the main `CollectionMint`, get it from the allowlist
    price = allowlistData.actual_price!;
  }

  return {
    txData: {
      from: minter,
      to: tx.to,
      data,
      value: bn(price!).mul(quantity).toHexString(),
    },
    price: price!,
  };
};

export const refreshMintsForCollection = async (collection: string) => {
  const standardResult = await idb.oneOrNone(
    `
      SELECT
        collection_mint_standards.standard
      FROM collection_mint_standards
      WHERE collection_mint_standards.collection_id = $/collection/
    `,
    {
      collection,
    }
  );
  if (standardResult) {
    switch (standardResult.standard) {
      case "decent":
        return Decent.refreshByCollection(collection);
      case "manifold":
        return Manifold.refreshByCollection(collection);
      case "seadrop-v1.0":
        return Seadrop.refreshByCollection(collection);
      case "thirdweb":
        return Thirdweb.refreshByCollection(collection);
      case "unknown":
        return Generic.refreshByCollection(collection);
      case "zora":
        return Zora.refreshByCollection(collection);
    }
  } else {
    const lastMintResult = await idb.oneOrNone(
      `
        SELECT
          nft_transfer_events.tx_hash
        FROM nft_transfer_events
        WHERE nft_transfer_events.address = $/contract/
          AND nft_transfer_events."from" = $/from/
          AND nft_transfer_events.is_deleted = 0
        ORDER BY nft_transfer_events.timestamp DESC
        LIMIT 1
      `,
      {
        contract: toBuffer(collection),
        from: toBuffer(AddressZero),
      }
    );
    if (lastMintResult) {
      await addToQueue(
        [
          {
            by: "tx",
            data: {
              txHash: fromBuffer(lastMintResult.tx_hash),
            },
          },
        ],
        true
      );
    }
  }
};
