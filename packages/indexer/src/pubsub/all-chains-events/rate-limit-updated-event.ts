import { logger } from "@/common/logger";
import { RateLimitRules } from "@/models/rate-limit-rules";
import { AllChainsChannel } from "@/pubsub/channels";

export class RateLimitUpdatedEvent {
  public static async handleEvent(message: string) {
    const parsedMessage = JSON.parse(message);
    await RateLimitRules.updateByCorrelationId(
      parsedMessage.rule.correlationId,
      parsedMessage.rule
    );

    logger.info(
      AllChainsChannel.RateLimitRuleUpdated,
      `Updated rate limit rule message=${message}`
    );
  }
}
