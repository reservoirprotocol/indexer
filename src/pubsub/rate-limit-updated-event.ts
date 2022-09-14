import { channels } from "@/pubsub/channels";
import { logger } from "@/common/logger";
import { config } from "@/config/index";
import { RateLimitRules } from "@/models/rate-limit-rules";

export class RateLimitUpdatedEvent {
  public static async handleEvent(message: string) {
    await RateLimitRules.forceDataReload();
    logger.info(
      channels.rateLimitRuleUpdated,
      `Reloaded rate limit rules message=${message} on ${config.railwayStaticUrl}`
    );
  }
}
