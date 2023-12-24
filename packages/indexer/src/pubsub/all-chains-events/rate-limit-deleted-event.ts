import { logger } from "@/common/logger";
import { RateLimitRules } from "@/models/rate-limit-rules";
import { AllChainsChannel } from "@/pubsub/channels";

export class RateLimitDeletedEvent {
  public static async handleEvent(message: string) {
    const parsedMessage = JSON.parse(message);
    await RateLimitRules.deleteByCorrelationId(parsedMessage.correlationId);

    logger.info(
      AllChainsChannel.RateLimitRuleDeleted,
      `Deleted rate limit rule message=${message}`
    );
  }
}
