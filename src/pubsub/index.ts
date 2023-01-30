import _ from "lodash";

import { logger } from "@/common/logger";
import { redisSubscriber } from "@/common/redis";
import { config } from "@/config/index";
import { Channel } from "@/pubsub/channels";

import { ApiKeyUpdatedEvent } from "@/pubsub/api-key-updated-event";
import { RateLimitUpdatedEvent } from "@/pubsub/rate-limit-updated-event";
import { RoutersUpdatedEvent } from "@/pubsub/routers-updated-event";
import { SourcesUpdatedEvent } from "@/pubsub/sources-updated-event";

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

    case Channel.RoutersUpdated:
      await RoutersUpdatedEvent.handleEvent(message);
      break;

    case Channel.SourcesUpdated:
      await SourcesUpdatedEvent.handleEvent(message);
      break;
  }
});
