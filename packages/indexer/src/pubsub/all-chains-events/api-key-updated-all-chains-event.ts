import { logger } from "@/common/logger";
import { ApiKeyManager } from "@/models/api-keys";
import { AllChainsChannel } from "@/pubsub/channels";

export class ApiKeyUpdatedAllChainsEvent {
  public static async handleEvent(message: string) {
    const parsedMessage = JSON.parse(message);
    await ApiKeyManager.update(parsedMessage.key, parsedMessage.fields);

    logger.info(AllChainsChannel.ApiKeyUpdated, `Reloaded key=${parsedMessage.key}`);
  }
}
