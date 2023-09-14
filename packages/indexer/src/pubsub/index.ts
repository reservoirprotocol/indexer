import _ from "lodash";

import { logger } from "@/common/logger";
import { redisSubscriber, allChainsSyncRedisSubscriber, acquireLock } from "@/common/redis";
import { config } from "@/config/index";
import { AllChainsChannel, Channel } from "@/pubsub/channels";
import { ApiKeyUpdatedEvent } from "@/pubsub/events/api-key-updated-event";
import { RateLimitUpdatedEvent } from "@/pubsub/events/rate-limit-updated-event";
import { RoutersUpdatedEvent } from "@/pubsub/events/routers-updated-event";
import { SourcesUpdatedEvent } from "@/pubsub/events/sources-updated-event";
import { ApiKeyCreatedAllChainsEvent } from "@/pubsub/all-chains-events/api-key-created-all-chains-event";
import { ApiKeyUpdatedAllChainsEvent } from "@/pubsub/all-chains-events/api-key-updated-all-chains-event";
import { PauseRabbitConsumerQueueEvent } from "@/pubsub/events/pause-rabbit-consumer-queue-event";
import { ResumeRabbitConsumerQueueEvent } from "@/pubsub/events/resume-rabbit-consumer-queue-event";

import getUuidByString from "uuid-by-string";
import { RateLimitCreatedEvent } from "@/pubsub/all-chains-events/rate-limit-created-event";
import { RateLimitDeletedEvent } from "@/pubsub/all-chains-events/rate-limit-deleted-event";

// Subscribe to all channels defined in the `Channel` enum
redisSubscriber.subscribe(_.values(Channel), (error, count) => {
  if (error) {
    logger.error("pubsub", `Failed to subscribe ${error.message}`);
  }
  logger.info("pubsub", `subscribed to ${count} channels`);
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

    case Channel.RoutersUpdated:
      await RoutersUpdatedEvent.handleEvent(message);
      break;

    case Channel.SourcesUpdated:
      await SourcesUpdatedEvent.handleEvent(message);
      break;

    case Channel.PauseRabbitConsumerQueue:
      await PauseRabbitConsumerQueueEvent.handleEvent(message);
      break;

    case Channel.ResumeRabbitConsumerQueue:
      await ResumeRabbitConsumerQueueEvent.handleEvent(message);
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

        case AllChainsChannel.RateLimitRuleCreated:
          await RateLimitCreatedEvent.handleEvent(message);
          break;

        case AllChainsChannel.RateLimitRuleUpdated:
          await RateLimitUpdatedEvent.handleEvent(message);
          break;

        case AllChainsChannel.RateLimitRuleDeleted:
          await RateLimitDeletedEvent.handleEvent(message);
          break;
      }
    }
  });
}
