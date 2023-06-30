import crypto from "crypto";

import { config } from "@/config/index";

export const getSupportedChainName = () => {
  switch (config.chainId) {
    case 1:
      return "ethereum";
    case 5:
      return "goerli";
    case 137:
      return "matic";
    case 10:
      return "optimism";
    case 42161:
      return "arbitrum";
    case 56:
      return "bsc";
    case 43114:
      return "avalanche";
    case 11155111:
      return "sepolia";
    case 80001:
      return "mumbai";
    default:
      return "unknown";
  }
};

export function generateHash(...params: string[]) {
  return crypto
    .createHash("sha256")
    .update(`${params.join("")}`)
    .digest("hex");
}
