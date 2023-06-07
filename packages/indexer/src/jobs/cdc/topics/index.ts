import { config } from "@/config/index";
import { KafkaEventHandler } from "./KafkaEventHandler";
import { IndexerFillEventsHandler } from "@/jobs/cdc/topics/indexer-fill-events";
import { IndexerApprovalEventsHandler } from "@/jobs/cdc/topics/indexer-nft-approvals";
import { IndexerTransferEventsHandler } from "@/jobs/cdc/topics/indexer-nft-transfer-events";
import { IndexerOrdersHandler } from "@/jobs/cdc/topics/indexer-orders";
import { IndexerTokensHandler } from "@/jobs/cdc/topics/indexer-tokens";

export const TopicHandlers: KafkaEventHandler[] = [
  new IndexerTransferEventsHandler(),
  new IndexerApprovalEventsHandler(),
  new IndexerFillEventsHandler(),
  new IndexerTokensHandler(),
];

if (!config.doOldOrderWebsocketWork) {
  TopicHandlers.push(new IndexerOrdersHandler());
}
