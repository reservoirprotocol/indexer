import { IndexerOrderEventsHandler } from "@/jobs/cdc/topics/indexer-order-events";
import { IndexerTransferEventsHandler } from "@/jobs/cdc/topics/indexer-ft-transfer-events";
import { IndexerBalanceEventsHandler } from "@/jobs/cdc/topics/indexer-ft-balances";
import { IndexerApprovalEventsHandler } from "@/jobs/cdc/topics/indexer-ft-approvals";
import { IndexerFillEventsHandler } from "@/jobs/cdc/topics/indexer-fill-events";
import { IndexerBidEventsHandler } from "@/jobs/cdc/topics/indexer-bid-events";
import { KafkaCdcEventHandler } from "@/jobs/cdc/topics/kafka-cdc-event-handler-abstract";

export const TopicHandlers: KafkaCdcEventHandler[] = [
  new IndexerOrderEventsHandler(),
  new IndexerTransferEventsHandler(),
  new IndexerBalanceEventsHandler(),
  new IndexerApprovalEventsHandler(),
  new IndexerFillEventsHandler(),
  new IndexerBidEventsHandler(),
];
