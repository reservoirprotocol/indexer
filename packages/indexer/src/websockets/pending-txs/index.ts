import { config } from "@/config/index";
import * as pendingTxs from "@/utils/pending-txs";

if ([1].includes(config.chainId) && config.doWebsocketWork && config.bloxrouteAuth) {
  pendingTxs.startListener();
}
