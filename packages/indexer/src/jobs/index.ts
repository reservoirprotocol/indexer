// WARNING! For ease of accounting, make sure to keep the below lists sorted!

// Initialize all background job queues and crons

import "@/jobs/arweave-relay";
import "@/jobs/backfill";
import "@/jobs/bid-updates";
import "@/jobs/cache-check";
import "@/jobs/collections-refresh";
import "@/jobs/collection-updates";
import "@/jobs/currencies";
import "@/jobs/daily-volumes";
import "@/jobs/data-archive";
import "@/jobs/data-export";
import "@/jobs/events-sync";
import "@/jobs/fill-updates";
import "@/jobs/metadata-index";
import "@/jobs/nft-balance-updates";
import "@/jobs/oracle";
import "@/jobs/order-fixes";
import "@/jobs/order-updates";
import "@/jobs/orderbook";
import "@/jobs/sources";
import "@/jobs/token-updates";
import "@/jobs/update-attribute";
import "@/jobs/websocket-events";
import "@/jobs/metrics";
import "@/jobs/opensea-orders";
import "@/jobs/monitoring";
import "@/jobs/token-set-updates";

// Export all job queues for monitoring through the BullMQ UI

import * as fixActivitiesMissingCollection from "@/jobs/activities/fix-activities-missing-collection";
import * as processActivityEvent from "@/jobs/activities/process-activity-event";
import * as removeUnsyncedEventsActivities from "@/jobs/activities/remove-unsynced-events-activities";

import * as backfillBlockTimestamps from "@/jobs/backfill/backfill-block-timestamps";
import * as backfillCancelSeaport11Orders from "@/jobs/backfill/backfill-cancel-seaport-v11-orders";
import * as backfillInvalidatedOrders from "@/jobs/backfill/backfill-invalidated-orders";
import * as backfillExpiredOrders from "@/jobs/backfill/backfill-expired-orders";
import * as backfillExpiredOrders2 from "@/jobs/backfill/backfill-expired-orders-2";
import * as backfillFoundationSales from "@/jobs/backfill/backfill-foundation-sales";
import * as backfillMints from "@/jobs/backfill/backfill-mints";
import * as backfillBlurSales from "@/jobs/backfill/backfill-blur-sales";
import * as backfillSaleRoyalties from "@/jobs/backfill/backfill-sale-royalties";
import * as backfillUpdateMissingMetadata from "@/jobs/backfill/backfill-update-missing-metadata";
import * as backfillInvalidateSeaportV14Orders from "@/jobs/backfill/backfill-cancel-seaport-v11-orders";
import * as backfillNftBalancesLastTokenAppraisalValue from "@/jobs/backfill/backfill-nft-balances-last-token-appraisal-value";
import * as backfillCancelEventsCreatedAt from "@/jobs/backfill/backfill-cancel-events-created-at";
import * as backfillNftTransferEventsCreatedAt from "@/jobs/backfill/backfill-nft-transfer-events-created-at";
import * as backfillCollectionsRoyalties from "@/jobs/backfill/backfill-collections-royalties";
import * as backfillWrongNftBalances from "@/jobs/backfill/backfill-wrong-nft-balances";
import * as backfillFoundationOrders from "@/jobs/backfill/backfill-foundation-orders";

import * as topBidUpdate from "@/jobs/bid-updates/top-bid-update-queue";

import * as collectionsRefresh from "@/jobs/collections-refresh/collections-refresh";
import * as collectionsRefreshCache from "@/jobs/collections-refresh/collections-refresh-cache";

import * as collectionUpdatesFloorAsk from "@/jobs/collection-updates/floor-queue";
import * as collectionUpdatesNormalizedFloorAsk from "@/jobs/collection-updates/normalized-floor-queue";
import * as collectionUpdatesNonFlaggedFloorAsk from "@/jobs/collection-updates/non-flagged-floor-queue";
import * as collectionSetCommunity from "@/jobs/collection-updates/set-community-queue";
import * as collectionRecalcTokenCount from "@/jobs/collection-updates/recalc-token-count-queue";
import * as collectionRecalcOwnerCount from "@/jobs/collection-updates/recalc-owner-count-queue";
import * as collectionUpdatesMetadata from "@/jobs/collection-updates/metadata-queue";
import * as rarity from "@/jobs/collection-updates/rarity-queue";
import * as collectionUpdatesTopBid from "@/jobs/collection-updates/top-bid-queue";
import * as refreshContractCollectionsMetadata from "@/jobs/collection-updates/refresh-contract-collections-metadata-queue";
import * as updateCollectionActivity from "@/jobs/collection-updates/update-collection-activity";
import * as updateCollectionUserActivity from "@/jobs/collection-updates/update-collection-user-activity";
import * as updateCollectionDailyVolume from "@/jobs/collection-updates/update-collection-daily-volume";

import * as tokenSetUpdatesTopBid from "@/jobs/token-set-updates/top-bid-queue";
import * as tokenSetUpdatesTopBidSingleToken from "@/jobs/token-set-updates/top-bid-single-token-queue";

import * as currencies from "@/jobs/currencies/index";

import * as dailyVolumes from "@/jobs/daily-volumes/daily-volumes";
import * as oneDayVolumes from "@/jobs/daily-volumes/1day-volumes";

import * as processArchiveData from "@/jobs/data-archive/process-archive-data";
import * as exportData from "@/jobs/data-export/export-data";

import * as eventsSyncProcessResyncRequest from "@/jobs/events-sync/process-resync-request-queue";
import * as eventsSyncBackfill from "@/jobs/events-sync/backfill-queue";
import * as eventsSyncBlockCheck from "@/jobs/events-sync/block-check-queue";
import * as eventsSyncBackfillProcess from "@/jobs/events-sync/process/backfill";
import * as eventsSyncRealtimeProcess from "@/jobs/events-sync/process/realtime";
import * as eventsSyncRealtime from "@/jobs/events-sync/realtime-queue";
import * as eventsSyncRealtimeV2 from "@/jobs/events-sync/realtime-queue-v2";
import * as eventsSyncFtTransfersWriteBuffer from "@/jobs/events-sync/write-buffers/ft-transfers";
import * as eventsSyncNftTransfersWriteBuffer from "@/jobs/events-sync/write-buffers/nft-transfers";

import * as fillUpdates from "@/jobs/fill-updates/queue";
import * as fillPostProcess from "@/jobs/fill-updates/fill-post-process";

import * as flagStatusProcessJob from "@/jobs/flag-status/process-queue";
import * as flagStatusSyncJob from "@/jobs/flag-status/sync-queue";
import * as flagStatusGenerateAttributeTokenSet from "@/jobs/flag-status/generate-attribute-token-set";
import * as flagStatusGenerateCollectionTokenSet from "@/jobs/flag-status/generate-collection-token-set";
import * as flagStatusUpdate from "@/jobs/flag-status/update";

import * as metadataIndexFetch from "@/jobs/metadata-index/fetch-queue";
import * as metadataIndexProcessBySlug from "@/jobs/metadata-index/process-queue-by-slug";
import * as metadataIndexProcess from "@/jobs/metadata-index/process-queue";
import * as metadataIndexWrite from "@/jobs/metadata-index/write-queue";

import * as mintsProcess from "@/jobs/mints/process";

import * as updateNftBalanceFloorAskPrice from "@/jobs/nft-balance-updates/update-floor-ask-price-queue";
import * as updateNftBalanceTopBid from "@/jobs/nft-balance-updates/update-top-bid-queue";

import * as orderFixes from "@/jobs/order-fixes/fixes";
import * as orderRevalidations from "@/jobs/order-fixes/revalidations";

import * as orderUpdatesById from "@/jobs/order-updates/by-id-queue";
import * as orderUpdatesBuyOrder from "@/jobs/order-updates/order-updates-buy-order-queue";
import * as orderUpdatesSellOrder from "@/jobs/order-updates/order-updates-sell-order-queue";
import * as orderUpdatesByMaker from "@/jobs/order-updates/by-maker-queue";
import * as bundleOrderUpdatesByMaker from "@/jobs/order-updates/by-maker-bundle-queue";
import * as dynamicOrdersCron from "@/jobs/order-updates/cron/dynamic-orders-queue";
import * as erc20OrdersCron from "@/jobs/order-updates/cron/erc20-orders-queue";
import * as expiredOrdersCron from "@/jobs/order-updates/cron/expired-orders-queue";
import * as oracleOrdersCron from "@/jobs/order-updates/cron/oracle-orders-queue";
import * as blurBidsBufferMisc from "@/jobs/order-updates/misc/blur-bids-buffer";
import * as blurBidsRefreshMisc from "@/jobs/order-updates/misc/blur-bids-refresh";
import * as blurListingsRefreshMisc from "@/jobs/order-updates/misc/blur-listings-refresh";
import * as openSeaOffChainCancellations from "@/jobs/order-updates/misc/opensea-off-chain-cancellations";
import * as saveBidEvents from "@/jobs/order-updates/save-bid-events";

import * as orderbookOrders from "@/jobs/orderbook/orders-queue";
import * as orderbookOrdersV2 from "@/jobs/orderbook/orders-queue-v2";
import * as orderbookPostOrderExternal from "@/jobs/orderbook/post-order-external/orderbook-post-order-external-queue";
import * as orderbookPostOrderExternalOpensea from "@/jobs/orderbook/post-order-external/orderbook-post-order-external-opensea-queue";

import * as orderbookTokenSets from "@/jobs/orderbook/token-sets-queue";
import * as orderbookOpenseaListings from "@/jobs/orderbook/opensea-listings-queue";

import * as fetchSourceInfo from "@/jobs/sources/fetch-source-info";

import * as tokenUpdatesMint from "@/jobs/token-updates/mint-queue";
import * as tokenRefreshCache from "@/jobs/token-updates/token-refresh-cache";
import * as fetchCollectionMetadata from "@/jobs/token-updates/fetch-collection-metadata";
import * as tokenUpdatesFloorAsk from "@/jobs/token-updates/floor-queue";
import * as tokenUpdatesNormalizedFloorAsk from "@/jobs/token-updates/normalized-floor-queue";
import * as tokenRecalcSupply from "@/jobs/token-updates/token-reclac-supply";

import * as handleNewSellOrder from "@/jobs/update-attribute/handle-new-sell-order";
import * as handleNewBuyOrder from "@/jobs/update-attribute/handle-new-buy-order";
import * as resyncAttributeCache from "@/jobs/update-attribute/resync-attribute-cache";
import * as resyncAttributeCollection from "@/jobs/update-attribute/resync-attribute-collection";
import * as resyncAttributeFloorSell from "@/jobs/update-attribute/resync-attribute-floor-sell";
import * as resyncAttributeKeyCounts from "@/jobs/update-attribute/resync-attribute-key-counts";
import * as resyncAttributeValueCounts from "@/jobs/update-attribute/resync-attribute-value-counts";
import * as updateAttributeCounts from "@/jobs/update-attribute/update-attribute-counts";

import * as askWebsocketEventsTriggerQueue from "@/jobs/websocket-events/ask-websocket-events-trigger-queue";
import * as bidWebsocketEventsTriggerQueue from "@/jobs/websocket-events/bid-websocket-events-trigger-queue";
import * as approvalWebsocketEventsTriggerQueue from "@/jobs/websocket-events/approval-websocket-events-trigger-queue";
import * as transferWebsocketEventsTriggerQueue from "@/jobs/websocket-events/transfer-websocket-events-trigger-queue";
import * as saleWebsocketEventsTriggerQueue from "@/jobs/websocket-events/sale-websocket-events-trigger-queue";
import * as tokenWebsocketEventsTriggerQueue from "@/jobs/websocket-events/token-websocket-events-trigger-queue";
import * as topBidWebsocketEventsTriggerQueue from "@/jobs/websocket-events/top-bid-websocket-events-trigger-queue";

import * as countApiUsage from "@/jobs/metrics/count-api-usage";

import * as openseaOrdersProcessQueue from "@/jobs/opensea-orders/process-queue";
import * as openseaOrdersFetchQueue from "@/jobs/opensea-orders/fetch-queue";

import * as backfillTransferActivitiesElasticsearch from "@/jobs/elasticsearch/backfill-transfer-activities-elasticsearch";
import * as backfillSaleActivitiesElasticsearch from "@/jobs/elasticsearch/backfill-sale-activities-elasticsearch";
import * as backfillAskActivitiesElasticsearch from "@/jobs/elasticsearch/backfill-ask-activities-elasticsearch";
import * as backfillBidActivitiesElasticsearch from "@/jobs/elasticsearch/backfill-bid-activities-elasticsearch";
import * as backfillAskCancelActivitiesElasticsearch from "@/jobs/elasticsearch/backfill-ask-cancel-activities-elasticsearch";
import * as backfillBidCancelActivitiesElasticsearch from "@/jobs/elasticsearch/backfill-bid-cancel-activities-elasticsearch";
import * as backfillActivitiesElasticsearch from "@/jobs/elasticsearch/backfill-activities-elasticsearch";
import * as updateActivitiesCollection from "@/jobs/elasticsearch/update-activities-collection";
import * as refreshActivitiesTokenMetadata from "@/jobs/elasticsearch/refresh-activities-token-metadata";
import * as refreshActivitiesCollectionMetadata from "@/jobs/elasticsearch/refresh-activities-collection-metadata";

import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import amqplib, { Channel, Connection } from "amqplib";
import { config } from "@/config/index";
import _ from "lodash";
import getUuidByString from "uuid-by-string";
import { getMachineId } from "@/common/machine-id";
import { PausedRabbitMqQueues } from "@/models/paused-rabbit-mq-queues";
import { logger } from "@/common/logger";
import { RabbitMQMessage } from "@/common/rabbit-mq";
import { tokenReclacSupplyJob } from "@/jobs/token-updates/token-reclac-supply-job";
import { tokenRefreshCacheJob } from "@/jobs/token-updates/token-refresh-cache-job";
import { recalcOwnerCountQueueJob } from "@/jobs/collection-updates/recalc-owner-count-queue-job";
import { recalcTokenCountQueueJob } from "@/jobs/collection-updates/recalc-token-count-queue-job";
import { normalizedFloorQueueJob } from "@/jobs/token-updates/normalized-floor-queue-job";
import { mintQueueJob } from "@/jobs/token-updates/mint-queue-job";
import { tokenFloorQueueJob } from "@/jobs/token-updates/token-floor-queue-job";
import { fetchCollectionMetadataJob } from "@/jobs/token-updates/fetch-collection-metadata-job";
import { handleNewBuyOrderJob } from "@/jobs/update-attribute/handle-new-buy-order-job";
import { handleNewSellOrderJob } from "@/jobs/update-attribute/handle-new-sell-order-job";
import { resyncAttributeCacheJob } from "@/jobs/update-attribute/resync-attribute-cache-job";
import { resyncAttributeCollectionJob } from "@/jobs/update-attribute/resync-attribute-collection-job";
import { resyncAttributeFloorSellJob } from "@/jobs/update-attribute/resync-attribute-floor-sell-job";
import { resyncAttributeKeyCountsJob } from "@/jobs/update-attribute/resync-attribute-key-counts-job";
import { resyncAttributeValueCountsJob } from "@/jobs/update-attribute/resync-attribute-value-counts-job";
import { resyncAttributeCountsJob } from "@/jobs/update-attribute/update-attribute-counts-job";
import { topBidQueueJob } from "@/jobs/token-set-updates/top-bid-queue-job";
import { topBidSingleTokenQueueJob } from "@/jobs/token-set-updates/top-bid-single-token-queue-job";
import { fetchSourceInfoJob } from "@/jobs/sources/fetch-source-info-job";
import { removeUnsyncedEventsActivitiesJob } from "@/jobs/activities/remove-unsynced-events-activities-job";

export const gracefulShutdownJobWorkers = [
  orderUpdatesById.worker,
  orderUpdatesBuyOrder.worker,
  orderUpdatesSellOrder.worker,
  orderUpdatesByMaker.worker,
  bundleOrderUpdatesByMaker.worker,
  dynamicOrdersCron.worker,
  erc20OrdersCron.worker,
  expiredOrdersCron.worker,
  oracleOrdersCron.worker,
  tokenUpdatesFloorAsk.worker,
  tokenUpdatesNormalizedFloorAsk.worker,
];

export const allJobQueues = [
  fixActivitiesMissingCollection.queue,
  processActivityEvent.queue,
  removeUnsyncedEventsActivities.queue,

  backfillBlockTimestamps.queue,
  backfillCancelSeaport11Orders.queue,
  backfillInvalidatedOrders.queue,
  backfillExpiredOrders.queue,
  backfillExpiredOrders2.queue,
  backfillFoundationSales.queue,
  backfillFoundationOrders.queue,
  backfillMints.queue,
  backfillSaleRoyalties.queue,
  backfillUpdateMissingMetadata.queue,
  backfillNftBalancesLastTokenAppraisalValue.queue,
  backfillCancelEventsCreatedAt.queue,
  backfillNftTransferEventsCreatedAt.queue,
  backfillCollectionsRoyalties.queue,
  backfillWrongNftBalances.queue,
  backfillInvalidateSeaportV14Orders.queue,
  backfillBlurSales.queue,

  currencies.queue,

  topBidUpdate.queue,

  collectionsRefresh.queue,
  collectionsRefreshCache.queue,

  collectionUpdatesFloorAsk.queue,
  collectionUpdatesNormalizedFloorAsk.queue,
  collectionUpdatesNonFlaggedFloorAsk.queue,
  collectionSetCommunity.queue,
  collectionRecalcTokenCount.queue,
  collectionRecalcOwnerCount.queue,

  tokenSetUpdatesTopBid.queue,
  tokenSetUpdatesTopBidSingleToken.queue,

  collectionUpdatesMetadata.queue,
  rarity.queue,
  collectionUpdatesTopBid.queue,
  refreshContractCollectionsMetadata.queue,
  updateCollectionActivity.queue,
  updateCollectionUserActivity.queue,
  updateCollectionDailyVolume.queue,

  dailyVolumes.queue,
  oneDayVolumes.queue,

  processArchiveData.queue,

  exportData.queue,

  eventsSyncProcessResyncRequest.queue,
  eventsSyncBackfill.queue,
  eventsSyncBlockCheck.queue,
  eventsSyncBackfillProcess.queue,
  eventsSyncRealtimeProcess.queue,
  eventsSyncRealtime.queue,
  eventsSyncRealtimeV2.queue,
  eventsSyncFtTransfersWriteBuffer.queue,
  eventsSyncNftTransfersWriteBuffer.queue,

  fillUpdates.queue,
  fillPostProcess.queue,

  flagStatusProcessJob.queue,
  flagStatusSyncJob.queue,
  flagStatusGenerateAttributeTokenSet.queue,
  flagStatusGenerateCollectionTokenSet.queue,
  flagStatusUpdate.queue,

  metadataIndexFetch.queue,
  metadataIndexProcessBySlug.queue,
  metadataIndexProcess.queue,
  metadataIndexWrite.queue,

  mintsProcess.queue,

  updateNftBalanceFloorAskPrice.queue,
  updateNftBalanceTopBid.queue,

  orderFixes.queue,
  orderRevalidations.queue,

  orderUpdatesById.queue,
  orderUpdatesBuyOrder.queue,
  orderUpdatesSellOrder.queue,
  orderUpdatesByMaker.queue,
  bundleOrderUpdatesByMaker.queue,
  dynamicOrdersCron.queue,
  erc20OrdersCron.queue,
  expiredOrdersCron.queue,
  oracleOrdersCron.queue,
  blurBidsBufferMisc.queue,
  blurBidsRefreshMisc.queue,
  blurListingsRefreshMisc.queue,
  openSeaOffChainCancellations.queue,
  saveBidEvents.queue,

  orderbookOrders.queue,
  orderbookOrdersV2.queue,

  orderbookPostOrderExternal.queue,
  orderbookPostOrderExternalOpensea.queue,
  orderbookTokenSets.queue,
  orderbookOpenseaListings.queue,

  fetchSourceInfo.queue,

  tokenUpdatesMint.queue,
  tokenRefreshCache.queue,
  fetchCollectionMetadata.queue,
  tokenUpdatesFloorAsk.queue,
  tokenUpdatesNormalizedFloorAsk.queue,
  tokenRecalcSupply.queue,

  handleNewSellOrder.queue,
  handleNewBuyOrder.queue,
  resyncAttributeCache.queue,
  resyncAttributeCollection.queue,
  resyncAttributeFloorSell.queue,
  resyncAttributeKeyCounts.queue,
  resyncAttributeValueCounts.queue,
  updateAttributeCounts.queue,

  askWebsocketEventsTriggerQueue.queue,
  bidWebsocketEventsTriggerQueue.queue,
  approvalWebsocketEventsTriggerQueue.queue,
  transferWebsocketEventsTriggerQueue.queue,
  saleWebsocketEventsTriggerQueue.queue,
  tokenWebsocketEventsTriggerQueue.queue,
  topBidWebsocketEventsTriggerQueue.queue,

  countApiUsage.queue,

  openseaOrdersProcessQueue.queue,
  openseaOrdersFetchQueue.queue,

  backfillTransferActivitiesElasticsearch.queue,
  backfillSaleActivitiesElasticsearch.queue,
  backfillAskActivitiesElasticsearch.queue,
  backfillBidActivitiesElasticsearch.queue,
  backfillAskCancelActivitiesElasticsearch.queue,
  backfillBidCancelActivitiesElasticsearch.queue,
  backfillActivitiesElasticsearch.queue,
  updateActivitiesCollection.queue,
  refreshActivitiesTokenMetadata.queue,
  refreshActivitiesCollectionMetadata.queue,
];

export class RabbitMqJobsConsumer {
  private static rabbitMqConsumerConnection: Connection;
  private static queueToChannel: Map<string, Channel> = new Map();

  /**
   * Return array of all jobs classes, any new job MUST be added here
   */
  public static getQueues(): AbstractRabbitMqJobHandler[] {
    return [
      tokenReclacSupplyJob,
      tokenRefreshCacheJob,
      recalcOwnerCountQueueJob,
      recalcTokenCountQueueJob,
      normalizedFloorQueueJob,
      mintQueueJob,
      tokenFloorQueueJob,
      fetchCollectionMetadataJob,
      handleNewBuyOrderJob,
      handleNewSellOrderJob,
      resyncAttributeCacheJob,
      resyncAttributeCollectionJob,
      resyncAttributeFloorSellJob,
      resyncAttributeKeyCountsJob,
      resyncAttributeValueCountsJob,
      resyncAttributeCountsJob,
      topBidQueueJob,
      topBidSingleTokenQueueJob,
      fetchSourceInfoJob,
      removeUnsyncedEventsActivitiesJob,
    ];
  }

  public static async connect() {
    this.rabbitMqConsumerConnection = await amqplib.connect(config.rabbitMqUrl);
  }

  /**
   * Return unique consumer tag used to identify a specific consumer on each queue
   * @param queueName
   */
  public static getConsumerTag(queueName: string) {
    return getUuidByString(`${getMachineId()}${queueName}`);
  }

  /**
   * Subscribing to a given job
   * @param job
   */
  public static async subscribe(job: AbstractRabbitMqJobHandler) {
    // Check if the queue is paused
    const pausedQueues = await PausedRabbitMqQueues.getPausedQueues();
    if (_.indexOf(pausedQueues, job.getQueue()) !== -1) {
      logger.warn("rabbit-subscribe", `${job.getQueue()} is paused`);
      return;
    }

    let channel: Channel;

    // Some queues can use a shared channel as they are less important with low traffic
    if (job.getUseSharedChannel()) {
      const sharedChannel = RabbitMqJobsConsumer.queueToChannel.get(job.getSharedChannelName());

      if (sharedChannel) {
        channel = sharedChannel;
      } else {
        channel = await this.rabbitMqConsumerConnection.createChannel();
        RabbitMqJobsConsumer.queueToChannel.set(job.getSharedChannelName(), channel);
      }
    } else {
      channel = await this.rabbitMqConsumerConnection.createChannel();
      RabbitMqJobsConsumer.queueToChannel.set(job.getQueue(), channel);
    }

    await channel.prefetch(job.getConcurrency()); // Set the number of messages to consume simultaneously

    // Subscribe to the queue
    await channel.consume(
      job.getQueue(),
      async (msg) => {
        if (!_.isNull(msg)) {
          const rabbitMQMessage = JSON.parse(msg.content.toString()) as RabbitMQMessage;

          await job.consume(rabbitMQMessage);
          await channel.ack(msg);

          if (rabbitMQMessage.completeTime) {
            job.emit("onCompleted", rabbitMQMessage);
          }
        }
      },
      {
        consumerTag: RabbitMqJobsConsumer.getConsumerTag(job.getQueue()),
      }
    );

    // Subscribe to the retry queue
    await channel.consume(
      job.getRetryQueue(),
      async (msg) => {
        if (!_.isNull(msg)) {
          const rabbitMQMessage = JSON.parse(msg.content.toString()) as RabbitMQMessage;

          await job.consume(rabbitMQMessage);
          await channel.ack(msg);

          if (rabbitMQMessage.completeTime) {
            job.emit("onCompleted", rabbitMQMessage);
          }
        }
      },
      {
        consumerTag: RabbitMqJobsConsumer.getConsumerTag(job.getRetryQueue()),
      }
    );

    channel.on("error", (error) => {
      logger.error("rabbit-queues", `Channel error ${error}`);
    });
  }

  /**
   * Unsubscribing from the given job
   * @param job
   */
  static async unsubscribe(job: AbstractRabbitMqJobHandler) {
    const channelName = job.getUseSharedChannel() ? job.getSharedChannelName() : job.getQueue();
    const channel = RabbitMqJobsConsumer.queueToChannel.get(channelName);

    if (channel) {
      await channel.cancel(RabbitMqJobsConsumer.getConsumerTag(job.getQueue()));
      await channel.cancel(RabbitMqJobsConsumer.getConsumerTag(job.getRetryQueue()));
    }
  }

  /**
   * Going over all the jobs and calling the subscribe function for each queue
   */
  static async startRabbitJobsConsumer(): Promise<void> {
    await RabbitMqJobsConsumer.connect(); // Create a connection for the consumer

    for (const queue of RabbitMqJobsConsumer.getQueues()) {
      try {
        await RabbitMqJobsConsumer.subscribe(queue);
      } catch (error) {
        logger.error(
          "rabbit-subscribe",
          `failed to subscribe to ${queue.queueName} error ${error}`
        );
      }
    }
  }
}
