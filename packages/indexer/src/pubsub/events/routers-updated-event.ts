import { logger } from "@/common/logger";
import { Channel } from "@/pubsub/channels";
import { forceReloadRouters } from "@/utils/routers";

export class RoutersUpdatedEvent {
  public static async handleEvent(message: string) {
    await forceReloadRouters();
    logger.info(Channel.RoutersUpdated, `Reloaded routers message=${message}`);
  }
}
