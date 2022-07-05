import { BigNumber, BigNumberish } from "@ethersproject/bignumber";
import { formatEther, formatUnits } from "@ethersproject/units";

import { config } from "../config/index";

// --- BigNumbers and prices ---

export const bn = (value: BigNumberish) => BigNumber.from(value);

export const formatEth = (wei: BigNumberish) => Number(Number(formatEther(wei)).toFixed(5));

export const formatPrice = (value: BigNumberish, decimals = 18) =>
  Number(Number(formatUnits(value, decimals)).toFixed(5));

// --- Buffers ---

export const fromBuffer = (buffer: Buffer) => "0x" + buffer.toString("hex");

export const toBuffer = (hexValue: string) => Buffer.from(hexValue.slice(2), "hex");

// --- Continuations ---

export const splitContinuation = (c: string, regEx: RegExp) => {
  if (c.includes("_")) {
    return c.split("_");
  }

  c = decodeURIComponent(c);
  if (c.match(base64Regex)) {
    const decoded = Buffer.from(c, "base64").toString("ascii");
    if (decoded.match(regEx)) {
      return decoded.split("_");
    }
  }

  return c;
};

export const buildContinuation = (c: string) => Buffer.from(c).toString("base64");

export const base64Regex = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

// --- Networks ---

export const getNetworkName = () => {
  switch (config.chainId) {
    case 1:
      return "mainnet";
    case 4:
      return "rinkeby";
    case 10:
      return "optimism";
    default:
      return "unknown";
  }
};
