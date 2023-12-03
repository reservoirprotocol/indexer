import { defaultAbiCoder } from "@ethersproject/abi";
import { AddressZero } from "@ethersproject/constants";
import * as Sdk from "@reservoir0x/sdk";
import { TxData } from "@reservoir0x/sdk/dist/utils";
import _ from "lodash";

import { idb } from "@/common/db";
import { bn, fromBuffer, toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import { mintsProcessJob } from "@/jobs/mints/mints-process-job";
import { CollectionMint } from "@/orderbook/mints";
import * as mints from "@/orderbook/mints/calldata/detector";

// For now, use the deployer address
const DEFAULT_REFERRER = "0xf3d63166f0ca56c3c1a3508fce03ff0cf3fb691e";

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
      kind: "comment";
      abiType: string;
    }
  | {
      kind: "allowlist";
      abiType: string;
    }
  | {
      kind: "referrer";
      abiType: string;
    }
  | {
      kind: "custom";
      abiType: string;
    }
  | {
      kind: "tuple";
      params: AbiParam[];
    };

export type MintTxSchema = {
  to: string;
  data: {
    signature: string;
    params: AbiParam[];
  };
};

type BaseCustomInfo = {
  hasDynamicPrice?: boolean;
};

export type CustomInfo =
  | (BaseCustomInfo & mints.manifold.Info)
  | (BaseCustomInfo & mints.soundxyz.Info)
  | (BaseCustomInfo & mints.artblocks.Info);

export type PartialCollectionMint = Pick<
  CollectionMint,
  "collection" | "details" | "price" | "contract"
>;

export const normalizePartialCollectionMint = (
  partialCm: PartialCollectionMint
): CollectionMint => {
  return {
    collection: partialCm.collection ?? partialCm.contract,
    contract: partialCm.contract ?? partialCm.collection,
    stage: "claim",
    kind: "public",
    status: "open",
    standard: "unknown",
    details: partialCm.details,
    currency: Sdk.Common.Addresses.Native[config.chainId],
    price: partialCm.price ?? "0",
  };
};

export const generateCollectionMintTxData = async (
  collectionMint: CollectionMint,
  minter: string,
  quantity: number,
  options?: {
    comment?: string;
    referrer?: string;
  }
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

  const tx = collectionMint.details.tx;

  const encodeParams = async (params: AbiParam[]) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const abiData: { abiType: string; abiValue: any }[] = [];

    for (const p of params) {
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

        case "comment": {
          abiData.push({
            abiType: p.abiType,
            abiValue: options?.comment ?? "",
          });

          break;
        }

        case "referrer": {
          abiData.push({
            abiType: p.abiType,
            abiValue: options?.referrer ?? DEFAULT_REFERRER,
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
                abiValue = await mints.decent.generateProofValue(collectionMint, minter);
              }

              break;
            }

            case "manifold": {
              if (allowlistItemIndex === 0) {
                abiValue = [
                  (await mints.manifold.generateProofValue(collectionMint, minter)).value,
                ];
              } else {
                abiValue = [
                  (await mints.manifold.generateProofValue(collectionMint, minter)).merkleProof,
                ];
              }

              break;
            }

            case "thirdweb": {
              if (allowlistItemIndex === 0) {
                abiValue = allowlistData.price ?? collectionMint.price;
              } else {
                abiValue = await mints.thirdweb.generateProofValue(collectionMint, minter);
              }

              break;
            }

            case "zora": {
              if (collectionMint.tokenId) {
                // ERC1155
                const proofData = await mints.zora.generateProofValue(collectionMint, minter);
                abiValue = defaultAbiCoder.encode(
                  ["address", "uint256", "uint256", "bytes32[]"],
                  [minter, proofData.maxCanMint, proofData.price, proofData.proof]
                );
              } else {
                // ERC721
                if (allowlistItemIndex === 0) {
                  abiValue = allowlistData.max_mints;
                } else if (allowlistItemIndex === 1) {
                  abiValue = allowlistData.price;
                } else {
                  abiValue = (await mints.zora.generateProofValue(collectionMint, minter)).proof;
                }
              }

              break;
            }

            case "foundation": {
              if (allowlistItemIndex === 0) {
                abiValue = await mints.foundation.generateProofValue(collectionMint, minter);
              }

              break;
            }

            case "mintdotfun": {
              if (allowlistItemIndex === 0) {
                abiValue = await mints.mintdotfun.generateProofValue(
                  collectionMint,
                  minter,
                  options?.referrer ?? DEFAULT_REFERRER
                );
              }
              break;
            }

            case "soundxyz": {
              if (allowlistItemIndex === 0) {
                abiValue = await mints.soundxyz.generateProofValue(collectionMint, minter);
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

        case "custom": {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let abiValue: any;

          switch (collectionMint.standard) {
            case "zora": {
              abiValue = defaultAbiCoder.encode(
                ["bytes32"],
                ["0x" + minter.slice(2).padStart(64, "0")]
              );
              break;
            }

            default: {
              throw new Error("Custom fields not supported");
            }
          }

          abiData.push({
            abiType: p.abiType,
            abiValue: abiValue,
          });

          break;
        }

        case "tuple": {
          const subAbiData = await encodeParams(p.params);

          const abiType = "(" + subAbiData.map((c) => `${c.abiType}`).join(",") + ")";
          abiData.push({
            abiType: abiType,
            abiValue: subAbiData.map((c) => c.abiValue),
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

    return abiData;
  };

  const abiData = await encodeParams(tx.data.params);

  const data =
    tx.data.signature +
    (abiData.length
      ? defaultAbiCoder
          .encode(
            abiData.map(({ abiType }) => abiType),
            abiData.map(({ abiType, abiValue }) =>
              // Handle array values
              abiType.endsWith("[]") && !Array.isArray(abiValue) ? [abiValue] : abiValue
            )
          )
          .slice(2)
      : "");

  let price = collectionMint.price;

  // Compute the price just-in-time
  if (
    collectionMint.standard === "artblocks" &&
    (collectionMint.details.info as mints.artblocks.Info).daConfig
  ) {
    price = await mints.artblocks.getPrice(
      (collectionMint.details.info as mints.artblocks.Info).daConfig!
    );
  }

  // If the price is not available on the main `CollectionMint`, get it from the allowlist
  if (!price && allowlistData) {
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
      case "artblocks":
        await mints.artblocks.refreshByCollection(collection);
        break;

      case "createdotfun":
        await mints.createdotfun.refreshByCollection(collection);
        break;

      case "decent":
        await mints.decent.refreshByCollection(collection);
        break;

      case "foundation":
        await mints.foundation.refreshByCollection(collection);
        break;

      case "manifold":
        await mints.manifold.refreshByCollection(collection);
        break;

      case "mintdotfun":
        await mints.mintdotfun.refreshByCollection(collection);
        break;

      case "seadrop-v1.0":
        await mints.seadrop.refreshByCollection(collection);
        break;

      case "soundxyz":
        await mints.soundxyz.refreshByCollection(collection);
        break;

      case "thirdweb":
        await mints.thirdweb.refreshByCollection(collection);
        break;

      case "titlesxyz":
        await mints.titlesxyz.refreshByCollection(collection);
        break;

      case "unknown":
        await mints.generic.refreshByCollection(collection);
        break;

      case "zora":
        await mints.zora.refreshByCollection(collection);
        break;
    }
  }

  // To be able to switch from `unknown` to a known standard on collection refresh
  if (!standardResult || standardResult.standard === "unknown") {
    const lastMintsResult = await idb.manyOrNone(
      `
        SELECT
          nft_transfer_events.tx_hash
        FROM nft_transfer_events
        WHERE nft_transfer_events.address = $/contract/
          AND nft_transfer_events."from" = $/from/
          AND nft_transfer_events.is_deleted = 0
        ORDER BY nft_transfer_events.timestamp DESC
        LIMIT 20
      `,
      {
        contract: toBuffer(collection),
        from: toBuffer(AddressZero),
      }
    );
    if (lastMintsResult.length) {
      await mintsProcessJob.addToQueue(
        _.uniq(lastMintsResult.map((r) => fromBuffer(r.tx_hash))).map((txHash) => ({
          by: "tx",
          data: { txHash },
        })),
        true
      );
    }
  }
};
