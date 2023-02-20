import { config } from "@/config/index";
import crypto from "crypto";

export const getSupportedChainName = () => {
  switch (config.chainId) {
    case 1:
      return "ethereum";
    case 5:
      return "goerli";
    case 137:
      return "matic";
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
