import { config } from "@/config/index";

export const getSupportedChainName = () => {
  switch (config.chainId) {
    case 1:
      return "ethereum";
    case 5:
      return "goerli";
    case 137:
      return "polygon";
    default:
      return "unknown";
  }
};
