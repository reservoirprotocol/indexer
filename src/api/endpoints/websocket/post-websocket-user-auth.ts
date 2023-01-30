/* eslint-disable @typescript-eslint/no-explicit-any */

import { Request, RouteOptions } from "@hapi/hapi";

import { logger } from "@/common/logger";
import { config } from "@/config/index";

import * as Pusher from "pusher";
import { ApiKeyManager } from "@/models/api-keys";
import * as Boom from "@hapi/boom";

export const postWebsocketUserAuthOptions: RouteOptions = {
  description: "Websocket User Authentication",
  tags: ["api", "x-admin"],
  plugins: {
    "hapi-swagger": {
      orders: 13,
    },
  },
  handler: async (request: Request) => {
    const payload = request.payload as any;

    try {
      const socketId = payload.socket_id;
      const apiKey = payload.api_key;

      let apiKeyEntity;

      if (apiKey) {
        apiKeyEntity = await ApiKeyManager.getApiKey(apiKey);
      }

      if (!apiKeyEntity) {
        throw Boom.forbidden(`Wrong or missing API key. socketId=${socketId}, apiKey=${apiKey}`);
      }

      const user = {
        id: apiKey,
        user_info: {
          app_name: apiKeyEntity.appName,
        },
      };

      const server = new Pusher.default({
        appId: config.websocketServerAppId,
        key: config.websocketServerAppKey,
        secret: config.websocketServerAppSecret,
        host: config.websocketServerHost,
      });

      const authResponse = server.authenticateUser(socketId, user);

      logger.info(
        "post-websocket-user-auth-handler",
        `authenticateUser. payload=${JSON.stringify(payload)}, authResponse=${JSON.stringify(
          authResponse
        )}`
      );

      return authResponse;
    } catch (error) {
      logger.error("post-websocket-user-auth-handler", `Handler failure: ${error}`);
      throw error;
    }
  },
};
