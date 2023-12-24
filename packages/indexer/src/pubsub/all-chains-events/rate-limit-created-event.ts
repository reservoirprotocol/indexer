import { logger } from "@/common/logger";
import { RateLimitRules } from "@/models/rate-limit-rules";
import { AllChainsChannel } from "@/pubsub/channels";

export class RateLimitCreatedEvent {
  public static async handleEvent(message: string) {
    const parsedMessage = JSON.parse(message);

    await RateLimitRules.create(
      parsedMessage.rule.route,
      parsedMessage.rule.apiKey,
      parsedMessage.rule.method,
      parsedMessage.rule.tier,
      parsedMessage.rule.options,
      parsedMessage.rule.payload,
      parsedMessage.rule.correlationId
    );

    logger.info(
      AllChainsChannel.RateLimitRuleCreated,
      `Created rate limit rule message=${message}`
    );
  }
}
