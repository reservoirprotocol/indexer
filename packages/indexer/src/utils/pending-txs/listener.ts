import Websocket from "ws";

import { logger } from "@/common/logger";
import { baseProvider } from "@/common/provider";
import { config } from "@/config/index";
import { pendingTxsJob } from "@/jobs/pending-txs/pending-txs-job";
import { watchlist } from "@/utils/pending-txs/constants";
import { PendingMessage } from "@/utils/pending-txs/types";

const COMPONENT = "pending-txs-listener";

export class PendingTxsListener {
  public ws: Websocket;
  private useWatchlist: boolean;

  constructor(_useWatchlist = false) {
    this.useWatchlist = _useWatchlist;
    this.ws = new Websocket("wss://api.blxrbdn.com/ws", {
      headers: {
        Authorization: config.bloxrouteAuth,
      },
    });

    this.ws.on("open", () => {
      this.subscribe();
    });

    this.ws.on("error", (error) => {
      logger.error(COMPONENT, `Error from pending txs websocket: ${error}`);
    });
  }

  close() {
    this.ws.close();
  }

  subscribe() {
    const params: {
      include: string[];
      filters?: string;
    } = {
      include: [
        "tx_hash",
        "tx_contents.input",
        "tx_contents.to",
        "tx_contents.from",
        "tx_contents.value",
      ],
    };

    if (this.useWatchlist) {
      params.filters = `{to} IN ${JSON.stringify(watchlist.filter((c) => c))}`;
    }

    const pendingTxQuuery = {
      jsonrpc: "2.0",
      id: 1,
      method: "subscribe",
      params: ["newTxs", params],
    };

    this.ws.send(JSON.stringify(pendingTxQuuery));
  }

  listen(handler: (message: PendingMessage) => void) {
    this.ws.on("message", async (msg) => {
      const parsed = this.parseMessage(msg);
      if (parsed) {
        handler(parsed);
      }
    });
  }

  parseMessage(msg: Websocket.RawData): PendingMessage | undefined {
    const parsedMsg = JSON.parse(msg.toString());
    if (parsedMsg.params?.result) {
      return parsedMsg.params.result;
    }
  }

  async watchTxCompleted(hash: string): Promise<boolean> {
    return new Promise((resolve) => {
      const check = async () => {
        const receipt = await baseProvider.getTransactionReceipt(hash);
        if (receipt) {
          resolve(true);
        } else {
          setTimeout(() => check(), 5000);
        }
      };

      check();
    });
  }

  // Used for testing
  async getSamlePendingTx(
    filterFn: (message?: PendingMessage) => boolean
  ): Promise<PendingMessage> {
    return new Promise((resolve) => {
      const listen = async (msg: Websocket.RawData) => {
        const parsed = this.parseMessage(msg);
        const match = filterFn(parsed);
        if (match && parsed) {
          resolve(parsed);
          this.ws.off("message", listen);
        }
      };
      this.ws.on("message", listen);
    });
  }
}

export const startListener = () => {
  let listener: PendingTxsListener;
  let lastMessageTimestamp: number | undefined;

  const startNewListener = () => {
    listener = new PendingTxsListener();
    listener.listen(async (message) => {
      lastMessageTimestamp = Date.now();
      await pendingTxsJob.addToQueue([message]);
    });
  };

  startNewListener();

  // Every 5 minutes check to see if we got any message in the last 5 minutes.
  // If not, we assume the connection is stale and we reinitiate it.
  const FIVE_MINUTES = 5 * 60 * 1000;
  setInterval(() => {
    if (lastMessageTimestamp && lastMessageTimestamp <= Date.now() - FIVE_MINUTES) {
      logger.error(COMPONENT, "Stale pending-tx websocket, reinitiating");

      listener.close();
      startNewListener();
    }
  }, FIVE_MINUTES);
};
