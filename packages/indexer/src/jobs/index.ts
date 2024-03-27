// WARNING! For ease of accounting, make sure to keep the below lists sorted!

// Initialize all background job queues and crons

import "@/jobs/arweave-relay";
import "@/jobs/backfill";
import "@/jobs/collections-refresh";
import "@/jobs/daily-volumes";
import "@/jobs/data-archive";
import "@/jobs/events-sync";
import "@/jobs/metrics";
import "@/jobs/opensea-orders";
import "@/jobs/monitoring";
import "@/jobs/failed-messages";
import "@/jobs/top-selling-collections-cache";

// Export all job queues for monitoring through the BullMQ UI

import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";

import amqplibConnectionManager, {
  AmqpConnectionManager,
  ChannelWrapper,
} from "amqp-connection-manager";

import * as backfillWrongNftBalances from "@/jobs/backfill/backfill-wrong-nft-balances";
import * as backfillWrongERC1155Balances from "@/jobs/backfill/backfill-wrong-erc1155-balances";
import * as backfillExpiredOrders from "@/jobs/backfill/backfill-expired-orders";
import * as backfillExpiredOrders2 from "@/jobs/backfill/backfill-expired-orders-2";
import * as backfillRefreshCollectionMetadata from "@/jobs/backfill/backfill-refresh-collections-metadata";
import * as backfillSaleRoyalties from "@/jobs/backfill/backfill-sale-royalties";
import * as backfillSalePricingDecimalElasticsearch from "@/jobs/elasticsearch/activities/backfill/backfill-sales-pricing-decimal-elasticsearch";
import * as backfillRefreshCollectionsCreator from "@/jobs/backfill/backfill-refresh-collections-creator";
import * as backfillLooksrareSeaportOrders from "@/jobs/backfill/backfill-looksrare-seaport-orders";
import * as backfillSalesUsdPrice from "@/jobs/backfill/backfill-sales-usd-price";
import * as backfillSales from "@/jobs/backfill/backfill-sales";
import * as backfillReorgBlocks from "@/jobs/backfill/backfill-reorg-blocks";
import * as backfillDeletedSalesElasticsearch from "@/jobs/elasticsearch/activities/backfill/backfill-deleted-sales-elasticsearch";
import * as backfillRouter from "@/jobs/backfill/backfill-router";

import amqplib from "amqplib";
import { config } from "@/config/index";
import _ from "lodash";
import getUuidByString from "uuid-by-string";
import { getMachineId } from "@/common/machine-id";
import { PausedRabbitMqQueues } from "@/models/paused-rabbit-mq-queues";
import { RabbitMq, RabbitMQMessage } from "@/common/rabbit-mq";
import { getNetworkName } from "@/config/network";
import { logger } from "@/common/logger";
import { sha256 } from "@/common/utils";
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
import { removeUnsyncedEventsActivitiesJob } from "@/jobs/elasticsearch/activities/remove-unsynced-events-activities-job";
import { fixActivitiesMissingCollectionJob } from "@/jobs/elasticsearch/activities/fix-activities-missing-collection-job";
import { collectionMetadataQueueJob } from "@/jobs/collection-updates/collection-metadata-queue-job";
import { rarityQueueJob } from "@/jobs/collection-updates/rarity-queue-job";
import { nonFlaggedFloorQueueJob } from "@/jobs/collection-updates/non-flagged-floor-queue-job";
import { refreshContractCollectionsMetadataQueueJob } from "@/jobs/collection-updates/refresh-contract-collections-metadata-queue-job";
import { setCommunityQueueJob } from "@/jobs/collection-updates/set-community-queue-job";
import { topBidCollectionJob } from "@/jobs/collection-updates/top-bid-collection-job";
import { updateCollectionDailyVolumeJob } from "@/jobs/collection-updates/update-collection-daily-volume-job";
import { collectionNewContractDeployedJob } from "@/jobs/collections/collection-contract-deployed";
import { collectionRefreshJob } from "@/jobs/collections-refresh/collections-refresh-job";
import { collectionRefreshCacheJob } from "@/jobs/collections-refresh/collections-refresh-cache-job";
import { currenciesFetchJob } from "@/jobs/currencies/currencies-fetch-job";
import { oneDayVolumeJob } from "@/jobs/daily-volumes/1day-volumes-job";
import { dailyVolumeJob } from "@/jobs/daily-volumes/daily-volumes-job";
import { processArchiveDataJob } from "@/jobs/data-archive/process-archive-data-job";
import { exportDataJob } from "@/jobs/data-export/export-data-job";
import { processActivityEventJob } from "@/jobs/elasticsearch/activities/process-activity-event-job";
import { processActivityEventsJob } from "@/jobs/elasticsearch/activities/process-activity-events-job";

import { savePendingActivitiesJob } from "@/jobs/elasticsearch/activities/save-pending-activities-job";
import { deleteArchivedExpiredBidActivitiesJob } from "@/jobs/elasticsearch/activities/delete-archived-expired-bid-activities-job";
import { backfillActivitiesElasticsearchJob } from "@/jobs/elasticsearch/activities/backfill/backfill-activities-elasticsearch-job";
import { eventsSyncFtTransfersWriteBufferJob } from "@/jobs/events-sync/write-buffers/ft-transfers-job";
import { eventsSyncNftTransfersWriteBufferJob } from "@/jobs/events-sync/write-buffers/nft-transfers-job";
import { eventsSyncProcessBackfillJob } from "@/jobs/events-sync/process/events-sync-process-backfill";
import { openseaBidsQueueJob } from "@/jobs/orderbook/opensea-bids-queue-job";
import { eventsSyncBackfillJob } from "@/jobs/events-sync/events-sync-backfill-job";
import { blockCheckJob } from "@/jobs/events-sync/block-check-queue-job";
import { collectionNormalizedJob } from "@/jobs/collection-updates/collection-normalized-floor-queue-job";
import { replaceActivitiesCollectionJob } from "@/jobs/elasticsearch/activities/replace-activities-collection-job";
import { refreshActivitiesTokenMetadataJob } from "@/jobs/elasticsearch/activities/refresh-activities-token-metadata-job";
import { refreshActivitiesCollectionMetadataJob } from "@/jobs/elasticsearch/activities/refresh-activities-collection-metadata-job";
import { collectionFloorJob } from "@/jobs/collection-updates/collection-floor-queue-job";
import { eventsSyncProcessRealtimeJob } from "@/jobs/events-sync/process/events-sync-process-realtime";
import { fillUpdatesJob } from "@/jobs/fill-updates/fill-updates-job";
import { fillPostProcessJob } from "@/jobs/fill-updates/fill-post-process-job";
import { flagStatusUpdateJob } from "@/jobs/flag-status/flag-status-update-job";
import { tokenFlagStatusSyncJob } from "@/jobs/flag-status/token-flag-status-sync-job";
import { collectionSlugFlagStatusSyncJob } from "@/jobs/flag-status/collection-slug-flag-status-sync-job";
import { contractFlagStatusSyncJob } from "@/jobs/flag-status/contract-flag-status-sync-job";
import { backfillDeleteExpiredBidsElasticsearchJob } from "@/jobs/elasticsearch/activities/backfill/backfill-delete-expired-bids-elasticsearch-job";

import { metadataIndexFetchJob } from "@/jobs/metadata-index/metadata-fetch-job";
import { metadataIndexProcessJob } from "@/jobs/metadata-index/metadata-process-job";
import { metadataIndexWriteJob } from "@/jobs/metadata-index/metadata-write-job";
import { mintsProcessJob } from "@/jobs/mints/mints-process-job";
import { mintsRefreshJob } from "@/jobs/mints/mints-refresh-job";
import { mintsCheckJob } from "@/jobs/mints/mints-check-job";
import { mintsExpiredJob } from "@/jobs/mints/cron/mints-expired-job";
import { nftBalanceUpdateFloorAskJob } from "@/jobs/nft-balance-updates/update-floor-ask-price-job";
import { orderFixesJob } from "@/jobs/order-fixes/order-fixes-job";
import { orderRevalidationsJob } from "@/jobs/order-fixes/order-revalidations-job";
import { orderUpdatesByIdJob } from "@/jobs/order-updates/order-updates-by-id-job";
import { orderUpdatesDynamicOrderJob } from "@/jobs/order-updates/cron/dynamic-orders-job";
import { orderUpdatesErc20OrderJob } from "@/jobs/order-updates/cron/erc20-orders-job";
import { orderUpdatesExpiredOrderJob } from "@/jobs/order-updates/cron/expired-orders-job";
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
import { saleWebsocketEventsTriggerQueueJob } from "@/jobs/websocket-events/sale-websocket-events-trigger-job";
import { openseaOrdersProcessJob } from "@/jobs/opensea-orders/opensea-orders-process-job";
import { openseaOrdersFetchJob } from "@/jobs/opensea-orders/opensea-orders-fetch-job";
import { saveBidEventsJob } from "@/jobs/order-updates/save-bid-events-job";
import { countApiUsageJob } from "@/jobs/metrics/count-api-usage-job";
import { transferWebsocketEventsTriggerQueueJob } from "@/jobs/websocket-events/transfer-websocket-events-trigger-job";
import { tokenAttributeWebsocketEventsTriggerQueueJob } from "@/jobs/websocket-events/token-attribute-websocket-events-trigger-job";
import { topBidWebSocketEventsTriggerJob } from "@/jobs/websocket-events/top-bid-websocket-events-trigger-job";
import { collectionWebsocketEventsTriggerQueueJob } from "@/jobs/websocket-events/collection-websocket-events-trigger-job";
import { transferUpdatesJob } from "@/jobs/transfer-updates/transfer-updates-job";
import { backfillSaveActivitiesElasticsearchJob } from "@/jobs/elasticsearch/activities/backfill/backfill-save-activities-elasticsearch-job";
import { pendingExpiredOrdersCheckJob } from "@/jobs/orderbook/cron/pending-expired-orders-check-job";
import { askWebsocketEventsTriggerQueueJob } from "@/jobs/websocket-events/ask-websocket-events-trigger-job";
import { bidWebsocketEventsTriggerQueueJob } from "@/jobs/websocket-events/bid-websocket-events-trigger-job";
import { tokenWebsocketEventsTriggerJob } from "@/jobs/websocket-events/token-websocket-events-trigger-job";
import { blockGapCheckJob } from "@/jobs/events-sync/block-gap-check";
import { traceSyncJob } from "@/jobs/events-sync/trace-sync-job";
import { saveRedisTransactionsJob } from "@/jobs/events-sync/save-redis-transactions-job";
import { permitUpdatesJob } from "@/jobs/permit-updates/permit-updates-job";
import { expiredPermitsJob } from "@/jobs/permit-updates/cron/expired-permits-job";
import { topSellingCollectionsJob } from "@/jobs/top-selling-collections-cache/save-top-selling-collections-job";
import { newCollectionForTokenJob } from "@/jobs/token-updates/new-collection-for-token-job";
import { processConsecutiveTransferJob } from "@/jobs/events-sync/process-consecutive-transfer";
import { processAskEventJob } from "@/jobs/elasticsearch/asks/process-ask-event-job";
import { processAskEventsJob } from "@/jobs/elasticsearch/asks/process-ask-events-job";
import { backfillAsksElasticsearchJob } from "@/jobs/elasticsearch/asks/backfill-asks-elasticsearch-job";
import { collectionRefreshSpamJob } from "@/jobs/collections-refresh/collections-refresh-spam-job";
import { refreshAsksTokenJob } from "@/jobs/elasticsearch/asks/refresh-asks-token-job";
import { refreshAsksTokenAttributesJob } from "@/jobs/elasticsearch/asks/refresh-asks-token-attributes-job";
import { backfillTokenAsksJob } from "@/jobs/elasticsearch/asks/backfill-token-asks-job";
import { backfillCollectionAsksJob } from "@/jobs/elasticsearch/asks/backfill-collection-asks-job";

import { actionsLogJob } from "@/jobs/general-tracking/actions-log-job";
import { refreshAsksCollectionJob } from "@/jobs/elasticsearch/asks/refresh-asks-collection-job";
import { refreshActivitiesTokenJob } from "@/jobs/elasticsearch/activities/refresh-activities-token-job";
import { processCollectionEventJob } from "@/jobs/elasticsearch/collections/process-collection-event-job";
import { processCollectionEventsJob } from "@/jobs/elasticsearch/collections/process-collection-events-job";
import { backfillCollectionsElasticsearchJob } from "@/jobs/elasticsearch/collections/backfill-collections-elasticsearch-job";
import { onchainMetadataFetchTokenUriJob } from "@/jobs/metadata-index/onchain-metadata-fetch-token-uri-job";
import { onchainMetadataProcessTokenUriJob } from "@/jobs/metadata-index/onchain-metadata-process-token-uri-job";
import { updateUserCollectionsJob } from "@/jobs/nft-balance-updates/update-user-collections-job";
import { resyncUserCollectionsJob } from "@/jobs/nft-balance-updates/reynsc-user-collections-job";
import { backfillUserCollectionsJob } from "@/jobs/backfill/backfill-user-collections";
import { tokenReassignedUserCollectionsJob } from "@/jobs/nft-balance-updates/token-reassigned-user-collections-job";
import { backfillTransactionsDatesJob } from "@/jobs/backfill/backfill-transactions-dates";
import { backfillActiveUserCollectionsJob } from "@/jobs/backfill/backfill-active-user-collections";
import { backfillAirdropsJob } from "./backfill/backfill-airdrops";
import { backfillTransferSpamJob } from "./backfill/backfill-transfer-burst-spam";
import { syncApiKeysJob } from "@/jobs/api-keys/sync-api-keys-job";
import { collectionCheckSpamJob } from "@/jobs/collections-refresh/collections-check-spam-job";
import { backfillNftBalancesDatesJob } from "@/jobs/backfill/backfill-nft-balances-dates";
import { pendingTxsJob } from "@/jobs/pending-txs/pending-txs-job";
import { updateUserCollectionsSpamJob } from "@/jobs/nft-balance-updates/update-user-collections-spam-job";
import { updateNftBalancesSpamJob } from "@/jobs/nft-balance-updates/update-nft-balances-spam-job";
import { pendingTxWebsocketEventsTriggerQueueJob } from "@/jobs/websocket-events/pending-tx-websocket-events-trigger-job";
import { fixTokensMissingCollectionJob } from "@/jobs/token-updates/fix-tokens-missing-collection";
import { backfillTokensWithMissingCollectionJob } from "@/jobs/backfill/backfill-tokens-with-missing-collection-job";
import { recalcOnSaleCountQueueJob } from "@/jobs/collection-updates/recalc-on-sale-count-queue-job";
import { burnedTokenJob } from "@/jobs/token-updates/burned-token-job";
import { publishEventToKafkaStreamJob } from "@/jobs/websocket-events/publish-event-to-kafka-stream-job";
import { backfillInvalidatedPPV2OrdersJob } from "@/jobs/backfill/backfill-invalidated-ppv2-orders";

export const allJobQueues = [
  backfillWrongNftBalances.queue,
  backfillWrongERC1155Balances.queue,
  backfillExpiredOrders.queue,
  backfillExpiredOrders2.queue,
  backfillRefreshCollectionMetadata.queue,
  backfillSaleRoyalties.queue,
  backfillSalePricingDecimalElasticsearch.queue,
  backfillRefreshCollectionsCreator.queue,
  backfillLooksrareSeaportOrders.queue,
  backfillSalesUsdPrice.queue,
  backfillSales.queue,
  backfillReorgBlocks.queue,
  backfillDeletedSalesElasticsearch.queue,
  backfillRouter.queue,
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
      collectionNewContractDeployedJob,
      collectionRefreshJob,
      collectionRefreshCacheJob,
      currenciesFetchJob,
      oneDayVolumeJob,
      dailyVolumeJob,
      processArchiveDataJob,
      exportDataJob,
      processActivityEventJob,
      processActivityEventsJob,
      savePendingActivitiesJob,
      eventsSyncFtTransfersWriteBufferJob,
      eventsSyncNftTransfersWriteBufferJob,
      eventsSyncProcessBackfillJob,
      openseaBidsQueueJob,
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
      flagStatusUpdateJob,
      tokenFlagStatusSyncJob,
      collectionSlugFlagStatusSyncJob,
      contractFlagStatusSyncJob,
      metadataIndexFetchJob,
      metadataIndexProcessJob,
      metadataIndexWriteJob,
      onchainMetadataFetchTokenUriJob,
      onchainMetadataProcessTokenUriJob,
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
      traceSyncJob,
      saveRedisTransactionsJob,
      openseaOrdersProcessJob,
      openseaOrdersFetchJob,
      saveBidEventsJob,
      countApiUsageJob,
      collectionWebsocketEventsTriggerQueueJob,
      saleWebsocketEventsTriggerQueueJob,
      transferWebsocketEventsTriggerQueueJob,
      tokenAttributeWebsocketEventsTriggerQueueJob,
      topBidWebSocketEventsTriggerJob,
      backfillActivitiesElasticsearchJob,
      transferUpdatesJob,
      backfillSaveActivitiesElasticsearchJob,
      pendingExpiredOrdersCheckJob,
      askWebsocketEventsTriggerQueueJob,
      bidWebsocketEventsTriggerQueueJob,
      tokenWebsocketEventsTriggerJob,
      blockGapCheckJob,
      permitUpdatesJob,
      expiredPermitsJob,
      topSellingCollectionsJob,
      newCollectionForTokenJob,
      processConsecutiveTransferJob,
      processAskEventJob,
      processAskEventsJob,
      backfillAsksElasticsearchJob,
      backfillTokenAsksJob,
      backfillCollectionAsksJob,
      collectionRefreshSpamJob,
      refreshAsksTokenJob,
      refreshAsksTokenAttributesJob,
      actionsLogJob,
      refreshAsksCollectionJob,
      refreshActivitiesTokenJob,
      processCollectionEventJob,
      processCollectionEventsJob,
      backfillCollectionsElasticsearchJob,
      updateUserCollectionsJob,
      resyncUserCollectionsJob,
      backfillUserCollectionsJob,
      tokenReassignedUserCollectionsJob,
      backfillTransactionsDatesJob,
      backfillActiveUserCollectionsJob,
      backfillAirdropsJob,
      backfillTransferSpamJob,
      syncApiKeysJob,
      collectionCheckSpamJob,
      backfillNftBalancesDatesJob,
      pendingTxsJob,
      updateUserCollectionsSpamJob,
      updateNftBalancesSpamJob,
      pendingTxWebsocketEventsTriggerQueueJob,
      fixTokensMissingCollectionJob,
      backfillTokensWithMissingCollectionJob,
      recalcOnSaleCountQueueJob,
      burnedTokenJob,
      publishEventToKafkaStreamJob,
      backfillInvalidatedPPV2OrdersJob,
      deleteArchivedExpiredBidActivitiesJob,
      backfillDeleteExpiredBidsElasticsearchJob,
    ];
  }

  public static getQueuesHash(): string {
    return sha256(
      RabbitMqJobsConsumer.getQueues()
        .map((queue) => {
          return queue.getHash();
        })
        .join("-")
    );
  }

  public static getSharedChannelName(connectionIndex: number) {
    return `${RabbitMqJobsConsumer.sharedChannelName}:${connectionIndex}`;
  }

  public static async connectToVhost() {
    for (let i = 0; i < RabbitMqJobsConsumer.maxConsumerConnectionsCount; ++i) {
      const connection = amqplibConnectionManager.connect(
        {
          hostname: config.rabbitHostname,
          username: config.rabbitUsername,
          password: config.rabbitPassword,
          vhost: getNetworkName(),
        },
        {
          reconnectTimeInSeconds: 5,
          heartbeatIntervalInSeconds: 0,
        }
      );

      RabbitMqJobsConsumer.rabbitMqConsumerConnections.push(connection);

      const sharedChannel = connection.createChannel({
        confirm: false,
        name: RabbitMqJobsConsumer.getSharedChannelName(i),
      });

      // Create a shared channel for each connection
      RabbitMqJobsConsumer.sharedChannels.set(
        RabbitMqJobsConsumer.getSharedChannelName(i),
        sharedChannel
      );

      connection.once("disconnect", (error) => {
        logger.error(
          "rabbit-error",
          `Consumer connection error index ${i} isConnected ${connection.isConnected()} channelCount ${
            connection.channelCount
          } ${JSON.stringify(error)}`
        );
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
    if (_.indexOf(pausedQueues, job.queueName) !== -1) {
      logger.warn("rabbit-subscribe", `${job.queueName} is paused`);
      return;
    }

    // If we already subscribed
    if (RabbitMqJobsConsumer.queueToChannel.get(job.getQueue())) {
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
      channel = RabbitMqJobsConsumer.rabbitMqConsumerConnections[connectionIndex].createChannel({
        confirm: false,
        name: job.getQueue(),
      });

      await channel.waitForConnect();

      channel.once("connect", () => {
        logger.info(
          "rabbit-consume",
          `reconnected to ${job.getQueue()} isConnected ${RabbitMqJobsConsumer.rabbitMqConsumerConnections[
            connectionIndex
          ].isConnected()} channelCount ${
            RabbitMqJobsConsumer.rabbitMqConsumerConnections[connectionIndex].channelCount
          }`
        );
      });
    }

    RabbitMqJobsConsumer.queueToChannel.set(job.getQueue(), channel);

    RabbitMqJobsConsumer.channelsToJobs.get(channel)
      ? RabbitMqJobsConsumer.channelsToJobs.get(channel)?.push(job)
      : RabbitMqJobsConsumer.channelsToJobs.set(channel, [job]);

    // Subscribe to the queue
    await channel
      .consume(
        job.getQueue(),
        async (msg) => {
          if (!_.isNull(msg)) {
            await _.clone(job)
              .consume(channel, msg)
              .catch((error) => {
                logger.error(
                  "rabbit-consume",
                  `error consuming from ${job.getQueue()} error ${error}`
                );
              });
          }
        },
        {
          consumerTag: RabbitMqJobsConsumer.getConsumerTag(job.getQueue()),
          prefetch: job.getConcurrency(),
          noAck: false,
        }
      )
      .catch((error) => {
        logger.error(
          "rabbit-consume",
          `protocol error consuming from ${job.getQueue()} error ${error}`
        );
      });

    // If this is a queue supporting priority subscribe to the priority queue as well
    if (job.isPriorityQueue()) {
      await channel
        .consume(
          job.getPriorityQueue(),
          async (msg) => {
            if (!_.isNull(msg)) {
              await _.clone(job)
                .consume(channel, msg)
                .catch((error) => {
                  logger.error(
                    "rabbit-consume",
                    `error consuming from ${job.getPriorityQueue()} error ${error}`
                  );
                });
            }
          },
          {
            consumerTag: RabbitMqJobsConsumer.getConsumerTag(job.getPriorityQueue()),
            prefetch: job.getConcurrency(),
            noAck: false,
          }
        )
        .catch((error) => {
          logger.error(
            "rabbit-consume",
            `protocol error consuming from ${job.getPriorityQueue()} error ${error}`
          );
        });
    }
  }

  /**
   * Unsubscribing from the given job
   * @param job
   */
  static async unsubscribe(job: AbstractRabbitMqJobHandler) {
    for (const [key, channel] of RabbitMqJobsConsumer.queueToChannel) {
      await channel.cancel(RabbitMqJobsConsumer.getConsumerTag(job.getQueue()));
      if (job.isPriorityQueue()) {
        await channel.cancel(RabbitMqJobsConsumer.getConsumerTag(job.getPriorityQueue()));
      }

      RabbitMqJobsConsumer.queueToChannel.delete(key);
    }

    return true;
  }

  /**
   * Going over all the jobs and calling the subscribe function for each queue
   */
  static async startRabbitJobsConsumer(): Promise<void> {
    try {
      await RabbitMqJobsConsumer.connectToVhost(); // Create a connection for the consumer

      const subscribeToVhostPromises = [];

      try {
        for (const queue of RabbitMqJobsConsumer.getQueues()) {
          if (!queue.isDisableConsuming()) {
            subscribeToVhostPromises.push(RabbitMqJobsConsumer.subscribe(queue));
          }
        }

        await Promise.all(subscribeToVhostPromises);
      } catch (error) {
        logger.error("rabbit-subscribe", `failed to subscribe error ${error}`);
      }
    } catch (error) {
      logger.error("rabbit-subscribe-connection", `failed to open connections to consume ${error}`);
    }
  }

  static async retryQueue(queueName: string) {
    const job = _.find(RabbitMqJobsConsumer.getQueues(), (queue) => queue.getQueue() === queueName);

    if (job) {
      const deadLetterQueue = job.getDeadLetterQueue();

      const deadLetterQueueSize = await RabbitMq.getQueueSize(
        `${deadLetterQueue}`,
        getNetworkName()
      );

      // No messages in the dead letter queue
      if (deadLetterQueueSize === 0) {
        return 0;
      }

      const connection = await amqplib.connect({
        hostname: config.rabbitHostname,
        username: config.rabbitUsername,
        password: config.rabbitPassword,
        vhost: getNetworkName(),
      });

      const channel = await connection.createChannel();
      let counter = 0;

      logger.info(
        "rabbit-retry",
        `retrying ${deadLetterQueueSize} messages from ${deadLetterQueue} to ${queueName}`
      );

      await channel.prefetch(200);

      // Subscribe to the dead letter queue
      await new Promise<void>((resolve) =>
        channel.consume(
          `${deadLetterQueue}`,
          async (msg) => {
            if (!_.isNull(msg)) {
              await RabbitMq.send(queueName, JSON.parse(msg.content.toString()) as RabbitMQMessage);
              channel.ack(msg);
            }

            ++counter;
            if (counter >= deadLetterQueueSize) {
              resolve();
            }
          },
          {
            noAck: false,
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
