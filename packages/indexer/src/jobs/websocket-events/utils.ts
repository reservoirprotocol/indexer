import { idb } from "@/common/db";
import { toBuffer } from "@/common/utils";
import * as kafkaStreamProducer from "@/common/kafka-stream-producer";
import { getNetworkName } from "@/config/network";

export interface KafkaEvent {
  event: string;
  changed?: string[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
}

// Utility functions for parsing cdc event data

export async function getTokenMetadata(tokenId: string, contract: string) {
  const r = await idb.oneOrNone(
    `
    SELECT
      tokens.name,
      tokens.image,
      tokens.image_version,
      (tokens.metadata ->> 'image_mime_type')::TEXT AS image_mime_type,
      tokens.collection_id,
      collections.name AS collection_name
    FROM tokens
    LEFT JOIN collections 
      ON tokens.collection_id = collections.id
    WHERE tokens.contract = $/contract/ AND tokens.token_id = $/token_id/
  `,
    {
      token_id: tokenId,
      contract: toBuffer(contract),
    }
  );
  return r;
}

export const formatValidBetween = (validBetween: string) => {
  try {
    const parsed = JSON.parse(validBetween.replace("infinity", "null"));
    return {
      validFrom: Math.floor(new Date(parsed[0]).getTime() / 1000),
      validUntil: Math.floor(new Date(parsed[1]).getTime() / 1000),
    };
  } catch (error) {
    return {
      validFrom: null,
      validUntil: null,
    };
  }
};

export const formatStatus = (fillabilityStatus: string, approvalStatus: string) => {
  switch (fillabilityStatus) {
    case "filled":
      return "filled";
    case "cancelled":
      return "cancelled";
    case "expired":
      return "expired";
    case "no-balance":
      return "inactive";
  }

  switch (approvalStatus) {
    case "no-approval":
    case "disabled":
      return "inactive";
  }

  return "active";
};

export const publishKafkaEvent = async (event: KafkaEvent): Promise<void> => {
  const topic = mapEventToKafkaTopic(event);
  const partitionKey = mapEventToKafkaPartitionKey(event);

  return kafkaStreamProducer.publish(topic, event, partitionKey);
};

const mapEventToKafkaTopic = (event: KafkaEvent): string => {
  return `${getNetworkName()}.${event.event.split(".")[0]}s`;
};

const mapEventToKafkaPartitionKey = (event: KafkaEvent): string => {
  switch (event.event.split(".")[0]) {
    case "collection":
      return event.data.id;
    case "token":
      return event.data.token.collection.id || event.data.token.contract;
    case "ask":
      return event.data.id;
    case "bid":
      return event.data.id;
    case "sale":
      return event.data.token.collection.id || event.data.token.contract;
    case "transfer":
      return event.data.token.contract;
    case "pending-tx":
      return event.data.contract;
  }

  return "";
};
