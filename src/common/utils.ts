import { BigNumber, BigNumberish } from "@ethersproject/bignumber";
import { formatEther, formatUnits } from "@ethersproject/units";
import crypto from "crypto";

import { config } from "@/config/index";

// --- BigNumbers ---

export const bn = (value: BigNumberish) => BigNumber.from(value);

// --- Prices ---

export const formatEth = (value: BigNumberish) => Number(Number(formatEther(value)).toFixed(5));

export const formatUsd = (value: BigNumberish) => Number(Number(formatUnits(value, 6)).toFixed(5));

export const formatPrice = (value: BigNumberish, decimals = 18, roundDown = false) =>
  roundDown
    ? Math.floor(Number(Number(formatUnits(value, decimals)).toFixed(6)) * 100000) / 100000
    : Number(Number(formatUnits(value, decimals)).toFixed(5));

export const getNetAmount = (value: BigNumberish, bps: number) =>
  bn(value).sub(bn(value).mul(bps).div(10000)).toString();

// --- Encrypt / Decrypt ---

export const encrypt = (text: string) => {
  const cipher = crypto.createCipheriv("aes-256-ecb", config.cipherSecret, null);
  const encryptedText = Buffer.concat([cipher.update(text), cipher.final()]);
  return encryptedText.toString("hex");
};

export const decrypt = (text: string) => {
  const decipher = crypto.createDecipheriv("aes-256-ecb", config.cipherSecret, null);
  const decryptedAsset = Buffer.concat([
    decipher.update(Buffer.from(text, "hex")),
    decipher.final(),
  ]);
  return decryptedAsset.toString();
};

// --- Buffers ---

export const fromBuffer = (buffer: Buffer) => "0x" + buffer.toString("hex");

export const toBuffer = (hexValue: string) => Buffer.from(hexValue.slice(2), "hex");

// --- Time ---

export const now = () => Math.floor(Date.now() / 1000);

export const toTime = (dateString: string) => Math.floor(new Date(dateString).getTime() / 1000);

// --- Misc ---

export const concat = <T>(...items: (T[] | undefined)[]) => {
  let result: T[] = [];
  for (const item of items) {
    result = [...result, ...(item ?? [])];
  }
  return result;
};

export const compare = <T>(a: T[], b: T[]) => {
  const length = Math.min(a.length, b.length);
  for (let i = 0; i < length; i++) {
    if (a[i] > b[i]) {
      return 1;
    }
    if (a[i] < b[i]) {
      return -1;
    }
  }
  if (a.length === b.length) {
    return 0;
  }
  return b.length > a.length ? 1 : -1;
};

// --- Continuations ---

export const splitContinuation = (c: string, regEx?: RegExp) => {
  if (c.includes("_")) {
    return c.split("_");
  }

  c = decodeURIComponent(c);
  if (c.match(regex.base64)) {
    const decoded = Buffer.from(c, "base64").toString("ascii");
    if (regEx && decoded.match(regEx)) {
      return decoded.split("_");
    } else {
      return [decoded];
    }
  } else {
    return [c];
  }
};

export const buildContinuation = (c: string) => Buffer.from(c).toString("base64");

// --- Regex ---

export const regex = {
  base64: /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/,
  domain: /^[a-zA-Z0-9.-]+\.[a-zA-Z0-9]{2,}$|localhost/,
  address: /^0x[a-fA-F0-9]{40}$/,
  bytes32: /^0x[a-fA-F0-9]{64}$/,
  bytes: /^0x[a-fA-F0-9]+$/,
  token: /^0x[a-fA-F0-9]{40}:[0-9]+$/,
  fee: /^0x[a-fA-F0-9]{40}:[0-9]+$/,
  number: /^[0-9]+$/,
  unixTimestamp: /^[0-9]{10}$/,
};
