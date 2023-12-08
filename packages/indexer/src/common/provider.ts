import { StaticJsonRpcProvider } from "@ethersproject/providers";
import Arweave from "arweave";

import { logger } from "@/common/logger";
import { config } from "@/config/index";
import getUuidByString from "uuid-by-string";
import { WebSocketProvider } from "@ethersproject/providers";

// Use a static provider to avoid redundant `eth_chainId` calls
export const baseProvider = new StaticJsonRpcProvider(
  {
    url: config.baseNetworkHttpUrl,
    headers:
      config.chainId === 324
        ? {}
        : {
            "x-session-hash": getUuidByString(`${config.baseNetworkHttpUrl}${config.chainId}`),
          },
  },
  config.chainId
);

// https://github.com/ethers-io/ethers.js/issues/1053#issuecomment-808736570
export const safeWebSocketSubscription = (
  callback: (provider: WebSocketProvider) => Promise<void>
) => {
  const webSocketProvider = new WebSocketProvider(config.baseNetworkWsUrl);
  webSocketProvider.on("error", (error) => {
    logger.error("websocket-provider", `WebSocket subscription failed: ${error}`);
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  webSocketProvider._websocket.on("error", (error: any) => {
    logger.error("websocket-provider", `WebSocket subscription failed: ${error}`);
  });

  let pingTimeout: NodeJS.Timeout | undefined;
  let keepAliveInterval: NodeJS.Timer | undefined;

  const EXPECTED_PONG_BACK = 15000;
  const KEEP_ALIVE_CHECK_INTERVAL = 7500;
  webSocketProvider._websocket.on("open", async () => {
    keepAliveInterval = setInterval(() => {
      webSocketProvider._websocket.ping();

      pingTimeout = setTimeout(() => {
        webSocketProvider._websocket.terminate();
      }, EXPECTED_PONG_BACK);
    }, KEEP_ALIVE_CHECK_INTERVAL);

    await callback(webSocketProvider);
  });

  webSocketProvider._websocket.on("close", () => {
    if (keepAliveInterval) {
      clearInterval(keepAliveInterval);
    }
    if (pingTimeout) {
      clearTimeout(pingTimeout);
    }
    safeWebSocketSubscription(callback);
  });

  webSocketProvider._websocket.on("pong", () => {
    if (pingTimeout) {
      clearInterval(pingTimeout);
    }
  });
};

export const arweaveGateway = Arweave.init({
  host: "arweave.net",
  port: 443,
  protocol: "https",
});

export const getGasFee = async () => baseProvider.getBlock("pending").then((b) => b.baseFeePerGas!);
