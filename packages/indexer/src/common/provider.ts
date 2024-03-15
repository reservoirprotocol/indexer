import { StaticJsonRpcProvider, WebSocketProvider } from "@ethersproject/providers";
import Arweave from "arweave";
import getUuidByString from "uuid-by-string";

import { logger } from "@/common/logger";
import { bn } from "@/common/utils";
import { config } from "@/config/index";

const getBaseProviderHeaders = () => {
  const headers: { [key: string]: string } = {};
  if ([0].includes(config.chainId)) {
    headers["x-session-hash"] = getUuidByString(`${config.baseNetworkHttpUrl}${config.chainId}`);
  }

  if (config.thirdWebSecret) {
    headers["x-secret-key"] = config.thirdWebSecret;
  }

  return headers;
};

// Use a static provider to avoid redundant `eth_chainId` calls
export const baseProvider = new StaticJsonRpcProvider(
  {
    url: config.baseNetworkHttpUrl,
    headers: getBaseProviderHeaders(),
  },
  config.chainId
);

export const metadataIndexingBaseProvider = new StaticJsonRpcProvider(
  {
    url: config.baseNetworkMetadataIndexingUrl,
    headers: [1, 324].includes(config.chainId)
      ? {}
      : {
          "x-session-hash": getUuidByString(
            `${config.baseNetworkMetadataIndexingUrl}${config.chainId}`
          ),
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

export const getGasFee = async () =>
  baseProvider.getBlock("latest").then((b) => bn(b.baseFeePerGas ?? "0"));
