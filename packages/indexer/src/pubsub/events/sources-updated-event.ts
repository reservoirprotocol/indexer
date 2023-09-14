import { logger } from "@/common/logger";
import { Sources } from "@/models/sources";
import { Channel } from "@/pubsub/channels";

export class SourcesUpdatedEvent {
  public static async handleEvent(message: string) {
    await Sources.forceDataReload();
    logger.info(Channel.SourcesUpdated, `Reloaded sources message=${message}`);
  }
}
