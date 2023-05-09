import { IndexerOrderEventsHandler } from "@/jobs/cdc/topics/indexer-order-events";
import { IndexerTransferEventsHandler } from "@/jobs/cdc/topics/indexer-ft-transfer-events";
import { IndexerBalanceEventsHandler } from "@/jobs/cdc/topics/indexer-ft-balances";
import { IndexerApprovalEventsHandler } from "@/jobs/cdc/topics/indexer-ft-approvals";
import { IndexerFillEventsHandler } from "@/jobs/cdc/topics/indexer-fill-events";
import { IndexerBidEventsHandler } from "@/jobs/cdc/topics/indexer-bid-events";
import { KafkaEventHandler } from "@/jobs/cdc/topics/kafka-event-handler-abstract";

export const TopicHandlers: KafkaEventHandler[] = [
  new IndexerOrderEventsHandler(),
  new IndexerTransferEventsHandler(),
  new IndexerBalanceEventsHandler(),
  new IndexerApprovalEventsHandler(),
  new IndexerFillEventsHandler(),
  new IndexerBidEventsHandler(),
];
