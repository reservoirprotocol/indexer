import { defaultAbiCoder } from "@ethersproject/abi";
import { TxData } from "@reservoir0x/sdk/src/utils";
import axios from "axios";

import { bn } from "@/common/utils";
import * as calldataDetails from "@/orderbook/mints/calldata/detector";
import { CollectionMint } from "@/orderbook/mints";

export const generateCollectionMintTxData = async (
  collectionMint: CollectionMint,
  minter: string,
  contract: string,
  quantity: number,
  price: string
): Promise<TxData> => {
  const tx = collectionMint.details.tx;
  const abiData = await Promise.all(
    tx.data.params.map(async (p) => {
      switch (p.kind) {
        case "contract": {
          return {
            abiType: p.abiType,
            abiValue: contract,
          };
        }

        case "quantity": {
          return {
            abiType: p.abiType,
            abiValue: quantity,
          };
        }

        case "recipient": {
          return {
            abiType: p.abiType,
            abiValue: minter,
          };
        }

        case "allowlist-proof": {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let abiValue: any;
          switch (collectionMint.standard) {
            case "zora": {
              const info = collectionMint.details.info as calldataDetails.zora.Info;
              abiValue = await axios
                .get(`https://allowlist.zora.co/allowed?user=${minter}&root=${info.merkleRoot}`)
                .then(({ data }: { data: { proof: string[] }[] }) =>
                  data[0].proof.map((item) => `0x${item}`)
                );

              break;
            }

            default: {
              throw new Error("Allowlists not supported");
            }
          }

          return {
            abiType: p.abiType,
            abiValue,
          };
        }

        default: {
          return {
            abiType: p.abiType,
            abiValue: p.abiValue,
          };
        }
      }
    })
  );

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

  return {
    from: minter,
    to: tx.to,
    data,
    value: bn(price).mul(quantity).toHexString(),
  };
};
