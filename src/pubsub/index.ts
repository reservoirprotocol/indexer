import "@/pubsub/channels";

// Import and subscribe to the following events
import "@/pubsub/sources-updated-event";

import { redisSubscriber } from "@/common/redis";
import { channels } from "@/pubsub/channels";
import { logger } from "@/common/logger";
import { config } from "@/config/index";
import { SourcesUpdatedEvent } from "@/pubsub/sources-updated-event";
import { ApiKeyUpdatedEvent } from "@/pubsub/api-key-updated-event";
import { RateLimitUpdatedEvent } from "@/pubsub/rate-limit-updated-event";

redisSubscriber.subscribe(
  [channels.sourcesUpdated, channels.apiKeyUpdated, channels.rateLimitRuleUpdated],
  (err, count) => {
    if (err) {
      logger.error("pubsub", `Failed to subscribe ${err.message}`);
    }

    logger.info("pubsub", `${config.railwayStaticUrl} subscribed to ${count} channels`);
  }
);

redisSubscriber.on("message", async (channel, message) => {
  logger.info("pubsub", `Received message on channel ${channel}, message = ${message}`);

  switch (channel) {
    case channels.sourcesUpdated:
      await SourcesUpdatedEvent.handleEvent(message);
      break;

    case channels.apiKeyUpdated:
      await ApiKeyUpdatedEvent.handleEvent(message);
      break;

    case channels.rateLimitRuleUpdated:
      await RateLimitUpdatedEvent.handleEvent(message);
      break;
  }
});
