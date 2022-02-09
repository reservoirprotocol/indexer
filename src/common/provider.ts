import {
  StaticJsonRpcProvider,
  WebSocketProvider,
} from "@ethersproject/providers";
import Arweave from "arweave";

import { config } from "@/config/index";

// Use a static provider to avoid redundant `eth_chainId` calls
export const baseProvider = new StaticJsonRpcProvider(
  config.baseNetworkHttpUrl
);

// Default Arweave gateway
export const arweaveGateway = Arweave.init({
  host: "arweave.net",
  port: 443,
  protocol: "https",
});

// https://github.com/ethers-io/ethers.js/issues/1053#issuecomment-808736570
export const safeWebSocketSubscription = (
  callback: (provider: WebSocketProvider) => Promise<any>
) => {
  const webSocketProvider = new WebSocketProvider(config.baseNetworkWsUrl);

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
