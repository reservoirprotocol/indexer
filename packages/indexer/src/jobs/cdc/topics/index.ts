import { KafkaEventHandler } from "./KafkaEventHandler";
import { IndexerFillEventsHandler } from "./indexer-fill-events";
import { IndexerApprovalEventsHandler } from "./indexer-nft-approvals";
import { IndexerTransferEventsHandler } from "./indexer-nft-transfer-events";
import { IndexerOrdersHandler } from "./indexer-orders";

export const TopicHandlers: KafkaEventHandler[] = [
  new IndexerOrdersHandler(),
  new IndexerTransferEventsHandler(),
  new IndexerApprovalEventsHandler(),
  new IndexerFillEventsHandler(),
];
