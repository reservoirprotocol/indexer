import _ from "lodash";

import { logger } from "@/common/logger";
import { redisSubscriber, allChainsSyncRedisSubscriber, acquireLock } from "@/common/redis";
import { config } from "@/config/index";
import { AllChainsChannel, Channel } from "@/pubsub/channels";

import { ApiKeyUpdatedEvent } from "@/pubsub/api-key-updated-event";
import { RateLimitUpdatedEvent } from "@/pubsub/rate-limit-updated-event";
import { RoutersUpdatedEvent } from "@/pubsub/routers-updated-event";
import { SourcesUpdatedEvent } from "@/pubsub/sources-updated-event";
import { ApiKeyCreatedAllChainsEvent } from "@/pubsub/api-key-created-all-chains-event";
import { ApiKeyUpdatedAllChainsEvent } from "@/pubsub/api-key-updated-all-chains-event";
import getUuidByString from "uuid-by-string";

// Subscribe to all channels defined in the `Channel` enum
redisSubscriber.subscribe(_.values(Channel), (error, count) => {
  if (error) {
    logger.error("pubsub", `Failed to subscribe ${error.message}`);
  }
  logger.info("pubsub", `${config.railwayStaticUrl} subscribed to ${count} channels`);
});

redisSubscriber.on("message", async (channel, message) => {
  logger.info("pubsub", `Received message on channel ${channel}, message = ${message}`);

  switch (channel) {
    case Channel.ApiKeyUpdated:
      await ApiKeyUpdatedEvent.handleEvent(message);
      break;

    case Channel.RateLimitRuleUpdated:
      await RateLimitUpdatedEvent.handleEvent(message);
      break;

    case Channel.RouteApiPointsUpdated:
      await RateLimitUpdatedEvent.handleEvent(message);
      break;

    case Channel.RoutersUpdated:
      await RoutersUpdatedEvent.handleEvent(message);
      break;

    case Channel.SourcesUpdated:
      await SourcesUpdatedEvent.handleEvent(message);
      break;
  }
});

// Mainnet acts as the master, no need to subscribe for updates on mainnet
if (config.chainId !== 1) {
  // Subscribe to all channels defined in the `AllChainsChannel` enum
  allChainsSyncRedisSubscriber.subscribe(_.values(AllChainsChannel), (error, count) => {
    if (error) {
      logger.error("pubsub-all-chains", `Failed to subscribe ${error.message}`);
    }
    logger.info("pubsub-all-chains", `subscribed to ${count} channels`);
  });

  allChainsSyncRedisSubscriber.on("message", async (channel, message) => {
    // Prevent multiple pods processing same message
    if (await acquireLock(getUuidByString(message), 60)) {
      logger.info(
        "pubsub-all-chains",
        `Received message on channel ${channel}, message = ${message}`
      );

      switch (channel) {
        case AllChainsChannel.ApiKeyCreated:
          await ApiKeyCreatedAllChainsEvent.handleEvent(message);
          break;

        case AllChainsChannel.ApiKeyUpdated:
          await ApiKeyUpdatedAllChainsEvent.handleEvent(message);
          break;
      }
    }
  });
}
