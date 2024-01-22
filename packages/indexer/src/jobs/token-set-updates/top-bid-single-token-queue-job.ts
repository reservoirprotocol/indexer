import TopBidQueueJob from "@/jobs/token-set-updates/top-bid-queue-job";

export default class TopBidSingleTokenQueueJob extends TopBidQueueJob {
  queueName = "token-set-updates-top-bid-single-token-queue";
}

export const topBidSingleTokenQueueJob = new TopBidSingleTokenQueueJob();
