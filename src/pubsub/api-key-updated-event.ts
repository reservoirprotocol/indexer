import { channels } from "@/pubsub/channels";
import { logger } from "@/common/logger";
import { config } from "@/config/index";
import { ApiKeyManager } from "@/models/api-keys";

export class ApiKeyUpdatedEvent {
  public static async handleEvent(message: string) {
    const parsedMessage = JSON.parse(message);
    await ApiKeyManager.deleteCachedApiKey(parsedMessage.key);

    logger.info(
      channels.apiKeyUpdated,
      `Reloaded key=${parsedMessage.key} on ${config.railwayStaticUrl}`
    );
  }
}
