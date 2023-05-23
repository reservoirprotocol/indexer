import { defaultAbiCoder } from "@ethersproject/abi";
import { TxData } from "@reservoir0x/sdk/src/utils";

import { bn } from "@/common/utils";

export type AbiParam =
  | {
      kind: "unknown";
      abiType: string;
      abiValue: string;
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
    };

export type MintDetails = {
  tx: {
    to: string;
    data: {
      signature: string;
      params: AbiParam[];
    };
  };
};

export const generateMintTxData = (
  details: MintDetails,
  minter: string,
  contract: string,
  quantity: number,
  price: string
): TxData => {
  const abiData = details.tx.data.params.map((p) => {
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

      default: {
        return {
          abiType: p.abiType,
          abiValue: p.abiValue,
        };
      }
    }
  });

  const data =
    details.tx.data.signature +
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
    to: details.tx.to,
    data,
    value: bn(price).mul(quantity).toHexString(),
  };
};
