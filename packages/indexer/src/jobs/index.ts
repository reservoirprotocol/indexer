// WARNING! For ease of accounting, make sure to keep the below lists sorted!

// Initialize all background job queues and crons

import "@/jobs/arweave-relay";
import "@/jobs/backfill";
import "@/jobs/cache-check";
import "@/jobs/collections-refresh";
import "@/jobs/collection-updates";
import "@/jobs/daily-volumes";
import "@/jobs/data-archive";
import "@/jobs/data-export";
import "@/jobs/events-sync";
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

import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";

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
import * as backfillCollectionsPaymentTokens from "@/jobs/backfill/backfill-collections-payment-tokens";
import * as backfillWrongNftBalances from "@/jobs/backfill/backfill-wrong-nft-balances";
import * as backfillFoundationOrders from "@/jobs/backfill/backfill-foundation-orders";
import * as backfillLooksrareFills from "@/jobs/backfill/backfill-looks-rare-fills";
import * as backfillCollectionsIds from "@/jobs/backfill/backfill-collections-ids";
import * as backfillNftTransferEventsUpdatedAt from "@/jobs/backfill/backfill-nft-transfer-events-updated-at";

import * as eventsSyncRealtime from "@/jobs/events-sync/realtime-queue";
import * as eventsSyncRealtimeV2 from "@/jobs/events-sync/realtime-queue-v2";

import * as expiredMintsCron from "@/jobs/mints/cron/expired-mints";
import * as mintsCheck from "@/jobs/mints/check";
import * as mintsProcess from "@/jobs/mints/process";

import * as updateNftBalanceFloorAskPrice from "@/jobs/nft-balance-updates/update-floor-ask-price-queue";
import * as updateNftBalanceTopBid from "@/jobs/nft-balance-updates/update-top-bid-queue";

import * as orderFixes from "@/jobs/order-fixes/fixes";
import * as orderRevalidations from "@/jobs/order-fixes/revalidations";

import * as orderUpdatesById from "@/jobs/order-updates/by-id-queue";
import * as orderUpdatesByMaker from "@/jobs/order-updates/by-maker-queue";
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

import * as tokenUpdatesFloorAsk from "@/jobs/token-updates/floor-queue";

import * as askWebsocketEventsTriggerQueue from "@/jobs/websocket-events/ask-websocket-events-trigger-queue";
import * as bidWebsocketEventsTriggerQueue from "@/jobs/websocket-events/bid-websocket-events-trigger-queue";
import * as approvalWebsocketEventsTriggerQueue from "@/jobs/websocket-events/approval-websocket-events-trigger-queue";
import * as transferWebsocketEventsTriggerQueue from "@/jobs/websocket-events/transfer-websocket-events-trigger-queue";
import * as saleWebsocketEventsTriggerQueue from "@/jobs/websocket-events/sale-websocket-events-trigger-queue";
import * as tokenWebsocketEventsTriggerQueue from "@/jobs/websocket-events/token-websocket-events-trigger-queue";
import * as topBidWebsocketEventsTriggerQueue from "@/jobs/websocket-events/top-bid-websocket-events-trigger-queue";
import * as collectionWebsocketEventsTriggerQueue from "@/jobs/websocket-events/collection-websocket-events-trigger-queue";

import * as countApiUsage from "@/jobs/metrics/count-api-usage";

import * as openseaOrdersProcessQueue from "@/jobs/opensea-orders/process-queue";
import * as openseaOrdersFetchQueue from "@/jobs/opensea-orders/fetch-queue";

import * as backfillTransferActivitiesElasticsearch from "@/jobs/activities/backfill/backfill-transfer-activities-elasticsearch";
import * as backfillSaleActivitiesElasticsearch from "@/jobs/activities/backfill/backfill-sale-activities-elasticsearch";
import * as backfillAskActivitiesElasticsearch from "@/jobs/activities/backfill/backfill-ask-activities-elasticsearch";
import * as backfillBidActivitiesElasticsearch from "@/jobs/activities/backfill/backfill-bid-activities-elasticsearch";
import * as backfillAskCancelActivitiesElasticsearch from "@/jobs/activities/backfill/backfill-ask-cancel-activities-elasticsearch";
import * as backfillBidCancelActivitiesElasticsearch from "@/jobs/activities/backfill/backfill-bid-cancel-activities-elasticsearch";
import * as backfillActivitiesElasticsearch from "@/jobs/activities/backfill/backfill-activities-elasticsearch";
import * as backfillDeleteExpiredBidsElasticsearch from "@/jobs/activities/backfill/backfill-delete-expired-bids-elasticsearch";

import amqplib, { Channel, Connection } from "amqplib";
import { config } from "@/config/index";
import _ from "lodash";
import getUuidByString from "uuid-by-string";
import { getMachineId } from "@/common/machine-id";
import { PausedRabbitMqQueues } from "@/models/paused-rabbit-mq-queues";
import { logger } from "@/common/logger";
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
import { fixActivitiesMissingCollectionJob } from "@/jobs/activities/fix-activities-missing-collection-job";
import { collectionMetadataQueueJob } from "@/jobs/collection-updates/collection-metadata-queue-job";
import { rarityQueueJob } from "@/jobs/collection-updates/rarity-queue-job";
import { nonFlaggedFloorQueueJob } from "@/jobs/collection-updates/non-flagged-floor-queue-job";
import { refreshContractCollectionsMetadataQueueJob } from "@/jobs/collection-updates/refresh-contract-collections-metadata-queue-job";
import { setCommunityQueueJob } from "@/jobs/collection-updates/set-community-queue-job";
import { topBidCollectionJob } from "@/jobs/collection-updates/top-bid-collection-job";
import { updateCollectionDailyVolumeJob } from "@/jobs/collection-updates/update-collection-daily-volume-job";
import { collectionRefreshJob } from "@/jobs/collections-refresh/collections-refresh-job";
import { collectionRefreshCacheJob } from "@/jobs/collections-refresh/collections-refresh-cache-job";
import { currenciesFetchJob } from "@/jobs/currencies/currencies-fetch-job";
import { oneDayVolumeJob } from "@/jobs/daily-volumes/1day-volumes-job";
import { dailyVolumeJob } from "@/jobs/daily-volumes/daily-volumes-job";
import { processArchiveDataJob } from "@/jobs/data-archive/process-archive-data-job";
import { exportDataJob } from "@/jobs/data-export/export-data-job";
import { processActivityEventJob } from "@/jobs/activities/process-activity-event-job";
import { savePendingActivitiesJob } from "@/jobs/activities/save-pending-activities-job";
import { eventsSyncFtTransfersWriteBufferJob } from "@/jobs/events-sync/write-buffers/ft-transfers-job";
import { eventsSyncNftTransfersWriteBufferJob } from "@/jobs/events-sync/write-buffers/nft-transfers-job";
import { eventsSyncProcessBackfillJob } from "@/jobs/events-sync/process/events-sync-process-backfill";
import { openseaBidsQueueJob } from "@/jobs/orderbook/opensea-bids-queue-job";
import { processResyncRequestJob } from "@/jobs/events-sync/process-resync-request-queue-job";
import { eventsSyncBackfillJob } from "@/jobs/events-sync/events-sync-backfill-job";
import { blockCheckJob } from "@/jobs/events-sync/block-check-queue-job";
import { collectionNormalizedJob } from "@/jobs/collection-updates/collection-normalized-floor-queue-job";
import { replaceActivitiesCollectionJob } from "@/jobs/activities/replace-activities-collection-job";
import { refreshActivitiesTokenMetadataJob } from "@/jobs/activities/refresh-activities-token-metadata-job";
import { refreshActivitiesCollectionMetadataJob } from "@/jobs/activities/refresh-activities-collection-metadata-job";
import { collectionFloorJob } from "@/jobs/collection-updates/collection-floor-queue-job";
import { eventsSyncProcessRealtimeJob } from "@/jobs/events-sync/process/events-sync-process-realtime";
import { fillUpdatesJob } from "@/jobs/fill-updates/fill-updates-job";
import { fillPostProcessJob } from "@/jobs/fill-updates/fill-post-process-job";
import { generateCollectionTokenSetJob } from "@/jobs/flag-status/generate-collection-token-set-job";
import { flagStatusUpdateJob } from "@/jobs/flag-status/flag-status-update-job";
import { flagStatusProcessJob } from "@/jobs/flag-status/flag-status-process-job";
import { metadataIndexFetchJob } from "@/jobs/metadata-index/metadata-fetch-job";
import { metadataIndexProcessJob } from "@/jobs/metadata-index/metadata-process-job";
import { metadataIndexWriteJob } from "@/jobs/metadata-index/metadata-write-job";
import { metadataIndexProcessBySlugJob } from "@/jobs/metadata-index/metadata-process-by-slug-job";

export const gracefulShutdownJobWorkers = [
  orderUpdatesById.worker,
  orderUpdatesByMaker.worker,
  dynamicOrdersCron.worker,
  erc20OrdersCron.worker,
  expiredOrdersCron.worker,
  oracleOrdersCron.worker,
  tokenUpdatesFloorAsk.worker,
];

export const allJobQueues = [
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
  backfillCollectionsPaymentTokens.queue,
  backfillWrongNftBalances.queue,
  backfillInvalidateSeaportV14Orders.queue,
  backfillBlurSales.queue,
  backfillLooksrareFills.queue,
  backfillCollectionsIds.queue,
  backfillNftTransferEventsUpdatedAt.queue,

  eventsSyncRealtime.queue,
  eventsSyncRealtimeV2.queue,

  expiredMintsCron.queue,
  mintsCheck.queue,
  mintsProcess.queue,

  updateNftBalanceFloorAskPrice.queue,
  updateNftBalanceTopBid.queue,

  orderFixes.queue,
  orderRevalidations.queue,

  orderUpdatesById.queue,
  orderUpdatesByMaker.queue,
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

  tokenUpdatesFloorAsk.queue,

  askWebsocketEventsTriggerQueue.queue,
  bidWebsocketEventsTriggerQueue.queue,
  approvalWebsocketEventsTriggerQueue.queue,
  transferWebsocketEventsTriggerQueue.queue,
  saleWebsocketEventsTriggerQueue.queue,
  tokenWebsocketEventsTriggerQueue.queue,
  topBidWebsocketEventsTriggerQueue.queue,
  collectionWebsocketEventsTriggerQueue.queue,

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
  backfillDeleteExpiredBidsElasticsearch.queue,
];

export class RabbitMqJobsConsumer {
  private static maxConsumerConnectionsCount = 5;

  private static rabbitMqConsumerConnections: Connection[] = [];
  private static queueToChannel: Map<string, Channel> = new Map();
  private static sharedChannels: Map<string, Channel> = new Map();
  private static channelsToJobs: Map<Channel, AbstractRabbitMqJobHandler[]> = new Map();
  private static sharedChannelName = "shared-channel";

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
      fixActivitiesMissingCollectionJob,
      collectionMetadataQueueJob,
      rarityQueueJob,
      nonFlaggedFloorQueueJob,
      refreshContractCollectionsMetadataQueueJob,
      setCommunityQueueJob,
      topBidCollectionJob,
      updateCollectionDailyVolumeJob,
      collectionRefreshJob,
      collectionRefreshCacheJob,
      currenciesFetchJob,
      oneDayVolumeJob,
      dailyVolumeJob,
      processArchiveDataJob,
      exportDataJob,
      processActivityEventJob,
      savePendingActivitiesJob,
      eventsSyncFtTransfersWriteBufferJob,
      eventsSyncNftTransfersWriteBufferJob,
      eventsSyncProcessBackfillJob,
      openseaBidsQueueJob,
      processResyncRequestJob,
      eventsSyncBackfillJob,
      blockCheckJob,
      collectionNormalizedJob,
      replaceActivitiesCollectionJob,
      refreshActivitiesCollectionMetadataJob,
      refreshActivitiesTokenMetadataJob,
      collectionFloorJob,
      eventsSyncProcessRealtimeJob,
      fillUpdatesJob,
      fillPostProcessJob,
      generateCollectionTokenSetJob,
      flagStatusUpdateJob,
      flagStatusProcessJob,
      metadataIndexFetchJob,
      metadataIndexProcessJob,
      metadataIndexWriteJob,
      metadataIndexProcessBySlugJob,
    ];
  }

  public static getSharedChannelName(connectionIndex: number) {
    return `${RabbitMqJobsConsumer.sharedChannelName}:${connectionIndex}`;
  }

  public static async connect() {
    for (let i = 0; i < RabbitMqJobsConsumer.maxConsumerConnectionsCount; ++i) {
      const connection = await amqplib.connect(config.rabbitMqUrl);
      RabbitMqJobsConsumer.rabbitMqConsumerConnections.push(connection);

      // Create a shared channel for each connection
      RabbitMqJobsConsumer.sharedChannels.set(
        RabbitMqJobsConsumer.getSharedChannelName(i),
        await connection.createChannel()
      );

      connection.once("error", (error) => {
        logger.error("rabbit-error", `Consumer connection error ${error}`);
      });
    }
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
    const connectionIndex = _.random(0, RabbitMqJobsConsumer.maxConsumerConnectionsCount - 1);
    const sharedChannel = RabbitMqJobsConsumer.sharedChannels.get(
      RabbitMqJobsConsumer.getSharedChannelName(connectionIndex)
    );

    // Some queues can use a shared channel as they are less important with low traffic
    if (job.getUseSharedChannel() && sharedChannel) {
      channel = sharedChannel;
    } else {
      channel = await RabbitMqJobsConsumer.rabbitMqConsumerConnections[
        connectionIndex
      ].createChannel();
    }

    RabbitMqJobsConsumer.queueToChannel.set(job.getQueue(), channel);

    RabbitMqJobsConsumer.channelsToJobs.get(channel)
      ? RabbitMqJobsConsumer.channelsToJobs.get(channel)?.push(job)
      : RabbitMqJobsConsumer.channelsToJobs.set(channel, [job]);

    // Set the number of messages to consume simultaneously
    await channel.prefetch(job.getConcurrency());

    // Subscribe to the queue
    await channel.consume(
      job.getQueue(),
      async (msg) => {
        if (!_.isNull(msg)) {
          await job.consume(channel, msg);
        }
      },
      {
        consumerTag: RabbitMqJobsConsumer.getConsumerTag(job.getQueue()),
      }
    );

    // Set the number of messages to consume simultaneously for the retry queue
    await channel.prefetch(_.max([_.toInteger(job.getConcurrency() / 4), 1]) ?? 1);

    // Subscribe to the retry queue
    await channel.consume(
      job.getRetryQueue(),
      async (msg) => {
        if (!_.isNull(msg)) {
          await job.consume(channel, msg);
        }
      },
      {
        consumerTag: RabbitMqJobsConsumer.getConsumerTag(job.getRetryQueue()),
      }
    );

    channel.once("error", (error) => {
      logger.error("rabbit-error", `Consumer channel error ${error}`);

      const jobs = RabbitMqJobsConsumer.channelsToJobs.get(channel);
      if (jobs) {
        logger.error(
          "rabbit-error",
          `Jobs stopped consume ${JSON.stringify(
            jobs.map((job: AbstractRabbitMqJobHandler) => job.queueName)
          )}`
        );
      }
    });
  }

  /**
   * Unsubscribing from the given job
   * @param job
   */
  static async unsubscribe(job: AbstractRabbitMqJobHandler) {
    const channel = RabbitMqJobsConsumer.queueToChannel.get(job.getQueue());

    if (channel) {
      await channel.cancel(RabbitMqJobsConsumer.getConsumerTag(job.getQueue()));
      await channel.cancel(RabbitMqJobsConsumer.getConsumerTag(job.getRetryQueue()));
    }
  }

  /**
   * Going over all the jobs and calling the subscribe function for each queue
   */
  static async startRabbitJobsConsumer(): Promise<void> {
    try {
      await RabbitMqJobsConsumer.connect(); // Create a connection for the consumer

      for (const queue of RabbitMqJobsConsumer.getQueues()) {
        try {
          if (!queue.isDisableConsuming()) {
            await RabbitMqJobsConsumer.subscribe(queue);
          }
        } catch (error) {
          logger.error(
            "rabbit-subscribe",
            `failed to subscribe to ${queue.queueName} error ${error}`
          );
        }
      }
    } catch (error) {
      logger.error("rabbit-subscribe-connection", `failed to open connections to consume ${error}`);
    }
  }
}
