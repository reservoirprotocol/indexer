import { logger } from "@/common/logger";
import { redisWebsocketClient, redisWebsocketPublisher } from "./redis";
import { producer } from "@/jobs/cdc";
import { getNetworkName } from "@/config/network";

export interface WebsocketMessage {
  published_at?: number;
  event: string;
  tags: {
    [key: string]: string;
  };
  changed?: string[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
  offset?: string;
}

export const publishWebsocketEvent = async (message: WebsocketMessage): Promise<void> => {
  await addOffsetToSortedSet(message, message.offset);
  message.published_at = Date.now();
  await redisWebsocketPublisher.publish("events", JSON.stringify(message));

  await producer.send({
    topic: getNetworkName() + "-websocket-events",
    messages: [{ value: JSON.stringify(message) }],
  });
};

const enabledOffsetLoggingEvents = ["sale.created", "sale.updated", "sale.deleted"];

export const addOffsetToSortedSet = async (
  event: WebsocketMessage,
  offset?: string
): Promise<void> => {
  try {
    if (!offset || !enabledOffsetLoggingEvents.includes(event.event)) {
      return;
    }

    const stringOffset = String(offset);
    const stringEvent = String(event.event);

    await redisWebsocketClient.zadd(
      "offsets",
      String(Date.now()),
      `${stringOffset}-${stringEvent}`
    );
  } catch (error) {
    logger.error("add-offset-to-sorted-set", "Failed to add offset to sorted set: " + error);
  }
};
