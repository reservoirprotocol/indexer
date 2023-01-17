/* eslint-disable @typescript-eslint/no-explicit-any */

import { Request, RouteOptions } from "@hapi/hapi";

import { logger } from "@/common/logger";
import { config } from "@/config/index";

import * as Pusher from "pusher";

export const postUserAuthOptions: RouteOptions = {
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
      logger.info("post-user-auth-handler", `Start. payload=${JSON.stringify(payload)}`);

      const socketId = payload.socket_id;

      // Replace this with code to retrieve the actual user id and info
      const user = {
        id: "some_id",
        user_info: {
          name: "John Smith",
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
        "post-user-auth-handler",
        `authenticateUser. payload=${JSON.stringify(payload)}, authResponse=${JSON.stringify(
          authResponse
        )}`
      );

      return authResponse;
    } catch (error) {
      logger.error("post-user-auth-handler", `Handler failure: ${error}`);
      throw error;
    }
  },
};
