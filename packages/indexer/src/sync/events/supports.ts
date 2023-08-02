import { baseProvider } from "@/common/provider";
import { blockNumberToHex } from "./utils";

export let supports_eth_getBlockReceipts = false;
export let supports_eth_getBlockTrace = false;

export const checkSupports = async () => {
  // get latest block
  const latestBlock = await baseProvider.getBlockNumber();

  // try to call eth_getBlockReceipts
  try {
    await baseProvider.send("eth_getBlockReceipts", [blockNumberToHex(latestBlock)]);
    supports_eth_getBlockReceipts = true;
  } catch (error) {
    supports_eth_getBlockReceipts = false;
  }

  // try to call eth_getBlockTrace
  try {
    await baseProvider.send("debug_traceBlockByNumber", [
      blockNumberToHex(latestBlock),
      { tracer: "callTracer" },
    ]);
    supports_eth_getBlockTrace = true;
  } catch (error) {
    supports_eth_getBlockTrace = false;
  }
};
