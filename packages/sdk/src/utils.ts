import { BigNumber, BigNumberish } from "@ethersproject/bignumber";
import { keccak256 } from "@ethersproject/keccak256";
import { randomBytes } from "@ethersproject/random";
import { toUtf8Bytes, toUtf8String } from "@ethersproject/strings";

// Constants

export const BytesEmpty = "0x";
export const MaxUint256 = BigNumber.from("0x" + "f".repeat(64));

// Random

export const getRandomBytes = (numBytes = 32) => bn(randomBytes(numBytes));

export const generateRandomSalt = () => {
  return `0x${Buffer.from(randomBytes(8)).toString("hex").padStart(24, "0")}`;
};

// BigNumber

export const bn = (value: BigNumberish) => BigNumber.from(value);

// Time

export const getCurrentTimestamp = (delay = 0) => Math.floor(Date.now() / 1000 + delay);

// Ease of use

export const lc = (x: string) => x?.toLowerCase();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const n = (x: any) => (x ? Number(x) : x);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const s = (x: any) => (x ? String(x) : x);

export const uniqBy = <T>(items: T[], uniqId: (item: T) => string): T[] => {
  const result: T[] = [];
  const uniqItems = new Set<string>();
  for (const item of items) {
    const id = uniqId(item);
    if (!uniqItems.has(id)) {
      result.push(item);
      uniqItems.add(id);
    }
  }
  return result;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const getErrorMessage = (error: any) => {
  const errorMessage = error.response?.data ? JSON.stringify(error.response.data) : error.message;
  return errorMessage;
};

// Misc

export const getSourceHash = (source?: string) =>
  source ? keccak256(toUtf8Bytes(source)).slice(2, 10) : "";

export const generateSourceBytes = (source?: string) =>
  source === "reservoir.tools"
    ? getSourceHash(source)
    : getSourceHash("reservoir.tools") + getSourceHash(source);

export const getSourceV1 = (calldata: string) => {
  // Use the ASCII US (unit separator) character (code = 31) as a delimiter
  const SEPARATOR = "1f";

  // Only allow printable ASCII characters
  const isPrintableASCII = (value: string) => /^[\x20-\x7F]*$/.test(value);

  try {
    if (calldata.endsWith(SEPARATOR)) {
      const index = calldata.slice(0, -2).lastIndexOf(SEPARATOR);
      // If we cannot find the separated source string within the last
      // 32 bytes of the calldata, we simply assume it is missing
      if (index === -1 || calldata.length - index - 5 > 64) {
        return undefined;
      } else {
        const result = toUtf8String("0x" + calldata.slice(index + 2, -2));
        if (isPrintableASCII(result)) {
          return result;
        } else {
          return undefined;
        }
      }
    }
  } catch {
    return undefined;
  }
};

// Types

export type TxData = {
  from: string;
  to: string;
  data: string;
  value?: string;
};

export enum Network {
  // Mainnets
  Ethereum = 1,
  Optimism = 10,
  Bsc = 56,
  Gnosis = 100,
  Polygon = 137,
  Arbitrum = 42161,
  ArbitrumNova = 42170,
  Zora = 7777777,
  // Testnets
  EthereumGoerli = 5,
  ZoraTestnet = 999,
  MantleTestnet = 5001,
  LineaTestnet = 59140,
  Mumbai = 80001,
  BaseGoerli = 84531,
  ScrollAlpha = 534353,
  EthereumSepolia = 11155111,
}

export type ChainIdToAddress = { [chainId: number]: string };
export type ChainIdToAddressList = { [chainId: number]: string[] };
