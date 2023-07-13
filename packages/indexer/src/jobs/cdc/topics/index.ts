import { config } from "@/config/index";
import { KafkaEventHandler } from "./KafkaEventHandler";
import { IndexerFillEventsHandler } from "@/jobs/cdc/topics/indexer-fill-events";
import { IndexerTransferEventsHandler } from "@/jobs/cdc/topics/indexer-nft-transfer-events";
import { IndexerOrdersHandler } from "@/jobs/cdc/topics/indexer-orders";
import { IndexerTokensHandler } from "@/jobs/cdc/topics/indexer-tokens";
import { IndexerCollectionsHandler } from "@/jobs/cdc/topics/indexer-collections";

export const TopicHandlers: KafkaEventHandler[] = [
  new IndexerTransferEventsHandler(),
  new IndexerFillEventsHandler(),
  new IndexerTokensHandler(),
  new IndexerCollectionsHandler(),
];

if (!config.doOldOrderWebsocketWork) {
  TopicHandlers.push(new IndexerOrdersHandler());
}
