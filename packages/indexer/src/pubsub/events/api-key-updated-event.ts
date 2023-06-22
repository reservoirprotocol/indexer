import { logger } from "@/common/logger";
import { ApiKeyManager } from "@/models/api-keys";
import { Channel } from "@/pubsub/channels";

export class ApiKeyUpdatedEvent {
  public static async handleEvent(message: string) {
    const parsedMessage = JSON.parse(message);
    await ApiKeyManager.deleteCachedApiKey(parsedMessage.key);

    logger.info(Channel.ApiKeyUpdated, `Reloaded key=${parsedMessage.key}`);
  }
}
