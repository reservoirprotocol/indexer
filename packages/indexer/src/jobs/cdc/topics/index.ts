import { KafkaEventHandler } from "./KafkaEventHandler";
import { IndexerFillEventsHandler } from "./indexer-fill-events";
import { IndexerApprovalEventsHandler } from "./indexer-nft-approvals";
import { IndexerBalanceEventsHandler } from "./indexer-nft-balances";
import { IndexerTransferEventsHandler } from "./indexer-nft-transfer-events";
import { IndexerOrdersHandler } from "./indexer-orders";

export const TopicHandlers: KafkaEventHandler[] = [
  // new IndexerOrderEventsHandler(),
  new IndexerOrdersHandler(),
  new IndexerTransferEventsHandler(),
  new IndexerBalanceEventsHandler(),
  new IndexerApprovalEventsHandler(),
  new IndexerFillEventsHandler(),
];
