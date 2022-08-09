import { BigNumber, BigNumberish } from "@ethersproject/bignumber";
import { formatEther, formatUnits } from "@ethersproject/units";

// --- BigNumbers and prices ---

export const bn = (value: BigNumberish) => BigNumber.from(value);

export const formatEth = (value: BigNumberish) => Number(Number(formatEther(value)).toFixed(5));

export const formatUsd = (value: BigNumberish) => Number(Number(formatUnits(value, 6)).toFixed(5));

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
  if (c.match(regex.base64)) {
    const decoded = Buffer.from(c, "base64").toString("ascii");
    if (decoded.match(regEx)) {
      return decoded.split("_");
    }
  }

  return c;
};

export const buildContinuation = (c: string) => Buffer.from(c).toString("base64");

// --- Regex ---

export const regex = {
  base64: /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/,
  domain: /^[a-zA-Z0-9][a-zA-Z0-9.-]+[a-zA-Z0-9]$/,
  address: /^0x[a-fA-F0-9]{40}$/,
  bytes32: /^0x[a-fA-F0-9]{64}$/,
  token: /^0x[a-fA-F0-9]{40}:[0-9]+$/,
  number: /^[0-9]+$/,
  unix_timestamp: /^[0-9]{10}$/,
};
