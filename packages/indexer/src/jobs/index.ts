// WARNING! For ease of accounting, make sure to keep the below lists sorted!

// Initialize all background job queues and crons

import "@/jobs/arweave-relay";
import "@/jobs/backfill";
import "@/jobs/cache-check";
import "@/jobs/collections-refresh";
import "@/jobs/daily-volumes";
import "@/jobs/data-archive";
import "@/jobs/events-sync";
import "@/jobs/oracle";
import "@/jobs/order-updates";
import "@/jobs/websocket-events";
import "@/jobs/metrics";
import "@/jobs/opensea-orders";
import "@/jobs/monitoring";
import "@/jobs/token-set-updates";

// Export all job queues for monitoring through the BullMQ UI

import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";

import amqplibConnectionManager, {
  AmqpConnectionManager,
  ChannelWrapper,
} from "amqp-connection-manager";

import * as backfillExpiredOrders from "@/jobs/backfill/backfill-expired-orders";
import * as backfillRefreshCollectionMetadata from "@/jobs/backfill/backfill-refresh-collections-metadata";

import * as saveBidEvents from "@/jobs/order-updates/save-bid-events";
import * as askWebsocketEventsTriggerQueue from "@/jobs/websocket-events/ask-websocket-events-trigger-queue";
import * as bidWebsocketEventsTriggerQueue from "@/jobs/websocket-events/bid-websocket-events-trigger-queue";
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
import * as backfillSalePricingDecimalElasticsearch from "@/jobs/activities/backfill/backfill-sales-pricing-decimal-elasticsearch";

import amqplib from "amqplib";
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
import { deleteArchivedExpiredBidActivitiesJob } from "@/jobs/activities/delete-archived-expired-bid-activities-job";
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
import { mintsProcessJob } from "@/jobs/mints/mints-process-job";
import { mintsRefreshJob } from "@/jobs/mints/mints-refresh-job";
import { mintsCheckJob } from "@/jobs/mints/mints-check-job";
import { mintsExpiredJob } from "@/jobs/mints/cron/mints-expired-job";
import { nftBalanceUpdateFloorAskJob } from "@/jobs/nft-balance-updates/update-floor-ask-price-job";
import { orderFixesJob } from "@/jobs/order-fixes/order-fixes-job";
import { RabbitMq, RabbitMQMessage } from "@/common/rabbit-mq";
import { orderRevalidationsJob } from "@/jobs/order-fixes/order-revalidations-job";
import { orderUpdatesByIdJob } from "@/jobs/order-updates/order-updates-by-id-job";
import { orderUpdatesDynamicOrderJob } from "@/jobs/order-updates/cron/dynamic-orders-job";
import { orderUpdatesErc20OrderJob } from "@/jobs/order-updates/cron/erc20-orders-job";
import { orderUpdatesExpiredOrderJob } from "@/jobs/order-updates/cron/expired-orders-job";
import { orderUpdatesOracleOrderJob } from "@/jobs/order-updates/cron/oracle-orders-job";
import { blurBidsBufferJob } from "@/jobs/order-updates/misc/blur-bids-buffer-job";
import { blurBidsRefreshJob } from "@/jobs/order-updates/misc/blur-bids-refresh-job";
import { blurListingsRefreshJob } from "@/jobs/order-updates/misc/blur-listings-refresh-job";
import { orderUpdatesByMakerJob } from "@/jobs/order-updates/order-updates-by-maker-job";
import { openseaOffChainCancellationsJob } from "@/jobs/order-updates/misc/opensea-off-chain-cancellations-job";
import { orderbookOrdersJob } from "@/jobs/orderbook/orderbook-orders-job";
import { openseaListingsJob } from "@/jobs/orderbook/opensea-listings-job";
import { orderbookPostOrderExternalJob } from "@/jobs/orderbook/post-order-external/orderbook-post-order-external-job";
import { orderbookPostOrderExternalOpenseaJob } from "@/jobs/orderbook/post-order-external/orderbook-post-order-external-opensea-job";
import { eventsSyncRealtimeJob } from "@/jobs/events-sync/events-sync-realtime-job";
import { openseaOrdersProcessJob } from "@/jobs/opensea-orders/opensea-orders-process-job";
import { openseaOrdersFetchJob } from "@/jobs/opensea-orders/opensea-orders-fetch-job";
import { saveBidEventsJob } from "@/jobs/order-updates/save-bid-events-job";
import { countApiUsageJob } from "@/jobs/metrics/count-api-usage-job";

export const allJobQueues = [
  backfillExpiredOrders.queue,
  backfillRefreshCollectionMetadata.queue,

  saveBidEvents.queue,

  askWebsocketEventsTriggerQueue.queue,
  bidWebsocketEventsTriggerQueue.queue,
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
  backfillSalePricingDecimalElasticsearch.queue,
];

export class RabbitMqJobsConsumer {
  private static maxConsumerConnectionsCount = 5;

  private static rabbitMqConsumerConnections: AmqpConnectionManager[] = [];
  private static queueToChannel: Map<string, ChannelWrapper> = new Map();
  private static sharedChannels: Map<string, ChannelWrapper> = new Map();
  private static channelsToJobs: Map<ChannelWrapper, AbstractRabbitMqJobHandler[]> = new Map();
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
      mintsProcessJob,
      mintsRefreshJob,
      mintsCheckJob,
      mintsExpiredJob,
      nftBalanceUpdateFloorAskJob,
      orderFixesJob,
      orderRevalidationsJob,
      orderUpdatesByIdJob,
      orderUpdatesDynamicOrderJob,
      orderUpdatesErc20OrderJob,
      orderUpdatesExpiredOrderJob,
      orderUpdatesOracleOrderJob,
      blurBidsBufferJob,
      blurBidsRefreshJob,
      blurListingsRefreshJob,
      deleteArchivedExpiredBidActivitiesJob,
      orderUpdatesByMakerJob,
      openseaOffChainCancellationsJob,
      orderbookOrdersJob,
      openseaListingsJob,
      orderbookPostOrderExternalJob,
      orderbookPostOrderExternalOpenseaJob,
      eventsSyncRealtimeJob,
      openseaOrdersProcessJob,
      openseaOrdersFetchJob,
      saveBidEventsJob,
      countApiUsageJob,
    ];
  }

  public static getSharedChannelName(connectionIndex: number) {
    return `${RabbitMqJobsConsumer.sharedChannelName}:${connectionIndex}`;
  }

  public static async connect() {
    for (let i = 0; i < RabbitMqJobsConsumer.maxConsumerConnectionsCount; ++i) {
      const connection = await amqplibConnectionManager.connect(config.rabbitMqUrl);
      RabbitMqJobsConsumer.rabbitMqConsumerConnections.push(connection);

      // Create a shared channel for each connection
      RabbitMqJobsConsumer.sharedChannels.set(
        RabbitMqJobsConsumer.getSharedChannelName(i),
        await connection.createChannel({ confirm: false })
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

    let channel: ChannelWrapper;
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
      ].createChannel({ confirm: false });
    }

    RabbitMqJobsConsumer.queueToChannel.set(job.getQueue(), channel);

    RabbitMqJobsConsumer.channelsToJobs.get(channel)
      ? RabbitMqJobsConsumer.channelsToJobs.get(channel)?.push(job)
      : RabbitMqJobsConsumer.channelsToJobs.set(channel, [job]);

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
        prefetch: job.getConcurrency(),
        noAck: false,
      }
    );

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
        prefetch: _.max([_.toInteger(job.getConcurrency() / 4), 1]) ?? 1,
        noAck: false,
      }
    );

    channel.once("error", async (error) => {
      logger.error("rabbit-channel", `Consumer channel error ${error}`);

      const jobs = RabbitMqJobsConsumer.channelsToJobs.get(channel);
      if (jobs) {
        // Resubscribe the jobs
        for (const job of jobs) {
          try {
            await this.subscribe(job);
          } catch (error) {
            logger.error(
              "rabbit-channel",
              `Consumer channel failed to resubscribe to ${job.queueName} ${error}`
            );
          }
        }

        logger.info(
          "rabbit-channel",
          `Resubscribed to ${JSON.stringify(
            jobs.map((job: AbstractRabbitMqJobHandler) => job.queueName)
          )}`
        );

        // Clear the channel that closed
        RabbitMqJobsConsumer.channelsToJobs.delete(channel);
      } else {
        logger.info("rabbit-channel", `no jobs found for channel`);
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

  static async retryQueue(queueName: string) {
    const job = _.find(RabbitMqJobsConsumer.getQueues(), (queue) => queue.getQueue() === queueName);

    if (job) {
      const deadLetterQueueSize = await RabbitMq.getQueueSize(job.getDeadLetterQueue());

      // No messages in the dead letter queue
      if (deadLetterQueueSize === 0) {
        return 0;
      }

      const connection = await amqplib.connect(config.rabbitMqUrl);
      const channel = await connection.createChannel();
      let counter = 0;

      await channel.prefetch(200);

      // Subscribe to the dead letter queue
      await new Promise<void>((resolve) =>
        channel.consume(
          job.getDeadLetterQueue(),
          async (msg) => {
            if (!_.isNull(msg)) {
              await RabbitMq.send(
                job.getRetryQueue(),
                JSON.parse(msg.content.toString()) as RabbitMQMessage
              );
            }

            ++counter;
            if (counter >= deadLetterQueueSize) {
              resolve();
            }
          },
          {
            noAck: true,
            exclusive: true,
          }
        )
      );

      await channel.close();
      await connection.close();

      return counter;
    }

    return 0;
  }
}
