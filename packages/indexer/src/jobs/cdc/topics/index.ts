import { KafkaEventHandler } from "./KafkaEventHandler";
import { IndexerBidEventsHandler } from "./indexer-bid-events";
import { IndexerFillEventsHandler } from "./indexer-fill-events";
import { IndexerApprovalEventsHandler } from "./indexer-nft-approvals";
import { IndexerBalanceEventsHandler } from "./indexer-nft-balances";
import { IndexerTransferEventsHandler } from "./indexer-nft-transfer-events";
import { IndexerOrderEventsHandler } from "./indexer-order-events";

export const TopicHandlers: KafkaEventHandler[] = [
  new IndexerOrderEventsHandler(),
  new IndexerTransferEventsHandler(),
  new IndexerBalanceEventsHandler(),
  new IndexerApprovalEventsHandler(),
  new IndexerFillEventsHandler(),
  new IndexerBidEventsHandler(),
];
