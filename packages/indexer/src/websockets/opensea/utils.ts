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
