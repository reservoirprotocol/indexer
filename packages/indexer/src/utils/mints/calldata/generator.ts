import { defaultAbiCoder } from "@ethersproject/abi";
import { TxData } from "@reservoir0x/sdk/src/utils";

import { bn } from "@/common/utils";

export type MintStandardAndDetails =
  | {
      standard: "unknown";
      details: {
        kind: "empty" | "numeric" | "address" | "numeric-address" | "address-numeric";
        methodSignature: string;
        methodParams: string;
      };
    }
  | {
      standard: "seadrop-v1.0";
      details: object;
    };

export const generateMintTxData = (
  { standard, details }: MintStandardAndDetails,
  minter: string,
  contract: string,
  quantity: number,
  price: string
): TxData => {
  let calldata: string | undefined;
  switch (standard) {
    case "unknown": {
      const params = details.methodParams.split(",");
      if (details.kind === "empty") {
        calldata = details.methodSignature;
      } else if (details.kind === "numeric") {
        calldata = details.methodSignature + defaultAbiCoder.encode(params, [quantity]).slice(2);
      } else if (details.kind === "address") {
        calldata = details.methodSignature + defaultAbiCoder.encode(params, [minter]).slice(2);
      } else if (details.kind === "numeric-address") {
        calldata =
          details.methodSignature + defaultAbiCoder.encode(params, [quantity, minter]).slice(2);
      } else if (details.kind === "address-numeric") {
        calldata =
          details.methodSignature + defaultAbiCoder.encode(params, [minter, quantity]).slice(2);
      }

      break;
    }

    case "seadrop-v1.0": {
      calldata = "0x";
    }
  }

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
