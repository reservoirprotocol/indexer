import { defaultAbiCoder } from "@ethersproject/abi";
import { TxData } from "@reservoir0x/sdk/src/utils";
import axios from "axios";

import { idb } from "@/common/db";
import { bn, toBuffer } from "@/common/utils";
import { CollectionMint } from "@/orderbook/mints";

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

export type CustomInfo = Zora.Info;

export const generateCollectionMintTxData = async (
  collectionMint: CollectionMint,
  minter: string,
  contract: string,
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
          abiValue: contract,
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
          case "zora": {
            if (allowlistItemIndex === 0) {
              abiValue = allowlistData.max_mints;
            } else if (allowlistItemIndex === 1) {
              abiValue = allowlistData.price;
            } else {
              const info = collectionMint.details.info as Zora.Info;
              abiValue = await axios
                .get(`https://allowlist.zora.co/allowed?user=${minter}&root=${info.merkleRoot}`)
                .then(({ data }: { data: { proof: string[] }[] }) =>
                  data[0].proof.map((item) => `0x${item}`)
                );
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
