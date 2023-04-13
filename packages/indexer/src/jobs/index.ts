// WARNING! For ease of accounting, make sure to keep the below lists sorted!

// Initialize all background job queues and crons

import "@/jobs/backfill";
import "@/jobs/bid-updates";
import "@/jobs/cache-check";
import "@/jobs/collections-refresh";
import "@/jobs/collection-updates";
import "@/jobs/currencies";
import "@/jobs/daily-volumes";
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

// Export all job queues for monitoring through the BullMQ UI

import * as fixActivitiesMissingCollection from "@/jobs/activities/fix-activities-missing-collection";
import * as processActivityEvent from "@/jobs/activities/process-activity-event";
import * as processActivityBackfillEvent from "@/jobs/activities/process-activity-event-backfill";
import * as removeUnsyncedEventsActivities from "@/jobs/activities/remove-unsynced-events-activities";

import * as backfillCancelSeaport11Orders from "@/jobs/backfill/backfill-cancel-seaport-v11-orders";
import * as backfillInvalidatedOrders from "@/jobs/backfill/backfill-invalidated-orders";
import * as backfillExpiredOrders from "@/jobs/backfill/backfill-expired-orders";
import * as backfillExpiredOrders2 from "@/jobs/backfill/backfill-expired-orders-2";
import * as backfillFoundationSales from "@/jobs/backfill/backfill-foundation-sales";
import * as backfillMints from "@/jobs/backfill/backfill-mints";
import * as backfillSaleRoyalties from "@/jobs/backfill/backfill-sale-royalties";
import * as backfillUpdateMissingMetadata from "@/jobs/backfill/backfill-update-missing-metadata";
import * as backfillNftBalancesLastTokenAppraisalValue from "@/jobs/backfill/backfill-nft-balances-last-token-appraisal-value";

import * as topBidUpdate from "@/jobs/bid-updates/top-bid-update-queue";

import * as collectionsRefresh from "@/jobs/collections-refresh/collections-refresh";
import * as collectionsRefreshCache from "@/jobs/collections-refresh/collections-refresh-cache";

import * as collectionUpdatesFloorAsk from "@/jobs/collection-updates/floor-queue";
import * as collectionUpdatesNormalizedFloorAsk from "@/jobs/collection-updates/normalized-floor-queue";
import * as collectionUpdatesNonFlaggedFloorAsk from "@/jobs/collection-updates/non-flagged-floor-queue";
import * as collectionSetCommunity from "@/jobs/collection-updates/set-community-queue";
import * as collectionRecalcTokenCount from "@/jobs/collection-updates/recalc-token-count-queue";
import * as collectionUpdatesMetadata from "@/jobs/collection-updates/metadata-queue";
import * as rarity from "@/jobs/collection-updates/rarity-queue";
import * as collectionUpdatesTopBid from "@/jobs/collection-updates/top-bid-queue";
import * as refreshContractCollectionsMetadata from "@/jobs/collection-updates/refresh-contract-collections-metadata-queue";
import * as updateCollectionActivity from "@/jobs/collection-updates/update-collection-activity";
import * as updateCollectionUserActivity from "@/jobs/collection-updates/update-collection-user-activity";
import * as updateCollectionDailyVolume from "@/jobs/collection-updates/update-collection-daily-volume";

import * as currencies from "@/jobs/currencies/index";

import * as dailyVolumes from "@/jobs/daily-volumes/daily-volumes";
import * as oneDayVolumes from "@/jobs/daily-volumes/1day-volumes";

import * as exportData from "@/jobs/data-export/export-data";

import * as eventsSyncProcessResyncRequest from "@/jobs/events-sync/process-resync-request-queue";
import * as eventsSyncBackfill from "@/jobs/events-sync/backfill-queue";
import * as eventsSyncBlockCheck from "@/jobs/events-sync/block-check-queue";
import * as eventsSyncBackfillProcess from "@/jobs/events-sync/process/backfill";
import * as eventsSyncRealtimeProcess from "@/jobs/events-sync/process/realtime";
import * as eventsSyncRealtime from "@/jobs/events-sync/realtime-queue";
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

import * as updateNftBalanceFloorAskPrice from "@/jobs/nft-balance-updates/update-floor-ask-price-queue";
import * as updateNftBalanceTopBid from "@/jobs/nft-balance-updates/update-top-bid-queue";

import * as orderFixes from "@/jobs/order-fixes/fixes";
import * as orderRevalidations from "@/jobs/order-fixes/revalidations";

import * as orderUpdatesById from "@/jobs/order-updates/by-id-queue";
import * as orderUpdatesByMaker from "@/jobs/order-updates/by-maker-queue";
import * as bundleOrderUpdatesByMaker from "@/jobs/order-updates/by-maker-bundle-queue";
import * as dynamicOrdersCron from "@/jobs/order-updates/cron/dynamic-orders-queue";
import * as erc20OrdersCron from "@/jobs/order-updates/cron/erc20-orders-queue";
import * as expiredOrdersCron from "@/jobs/order-updates/cron/expired-orders-queue";
import * as oracleOrdersCron from "@/jobs/order-updates/cron/oracle-orders-queue";

import * as orderbookOrders from "@/jobs/orderbook/orders-queue";
import * as orderbookPostOrderExternal from "@/jobs/orderbook/post-order-external";
import * as orderbookTokenSets from "@/jobs/orderbook/token-sets-queue";
import * as orderbookOpenseaListings from "@/jobs/orderbook/opensea-listings-queue";
import * as orderbookSaveOpenseaWebsocketEvents from "@/jobs/orderbook/save-opensea-websocket-events-queue";

import * as fetchSourceInfo from "@/jobs/sources/fetch-source-info";

import * as tokenUpdatesMint from "@/jobs/token-updates/mint-queue";
import * as tokenRefreshCache from "@/jobs/token-updates/token-refresh-cache";
import * as fetchCollectionMetadata from "@/jobs/token-updates/fetch-collection-metadata";
import * as tokenUpdatesFloorAsk from "@/jobs/token-updates/floor-queue";
import * as tokenUpdatesNormalizedFloorAsk from "@/jobs/token-updates/normalized-floor-queue";

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
import * as newTopBidTriggerQueue from "@/jobs/websocket-events/new-top-bid-trigger-queue";
import * as countApiUsage from "@/jobs/metrics/count-api-usage";

import * as openseaOrdersProcessQueue from "@/jobs/opensea-orders/process-queue";
import * as openseaOrdersFetchQueue from "@/jobs/opensea-orders/fetch-queue";

export const gracefulShutdownJobWorkers = [
  orderUpdatesById.worker,
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
  processActivityBackfillEvent.queue,
  removeUnsyncedEventsActivities.queue,

  backfillCancelSeaport11Orders.queue,
  backfillInvalidatedOrders.queue,
  backfillExpiredOrders.queue,
  backfillExpiredOrders2.queue,
  backfillFoundationSales.queue,
  backfillMints.queue,
  backfillSaleRoyalties.queue,
  backfillUpdateMissingMetadata.queue,
  backfillNftBalancesLastTokenAppraisalValue.queue,

  currencies.queue,

  topBidUpdate.queue,

  collectionsRefresh.queue,
  collectionsRefreshCache.queue,

  collectionUpdatesFloorAsk.queue,
  collectionUpdatesNormalizedFloorAsk.queue,
  collectionUpdatesNonFlaggedFloorAsk.queue,
  collectionSetCommunity.queue,
  collectionRecalcTokenCount.queue,

  collectionUpdatesMetadata.queue,
  rarity.queue,
  collectionUpdatesTopBid.queue,
  refreshContractCollectionsMetadata.queue,
  updateCollectionActivity.queue,
  updateCollectionUserActivity.queue,
  updateCollectionDailyVolume.queue,

  dailyVolumes.queue,
  oneDayVolumes.queue,

  exportData.queue,

  eventsSyncProcessResyncRequest.queue,
  eventsSyncBackfill.queue,
  eventsSyncBlockCheck.queue,
  eventsSyncBackfillProcess.queue,
  eventsSyncRealtimeProcess.queue,
  eventsSyncRealtime.queue,
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

  updateNftBalanceFloorAskPrice.queue,
  updateNftBalanceTopBid.queue,

  orderFixes.queue,
  orderRevalidations.queue,

  orderUpdatesById.queue,
  orderUpdatesByMaker.queue,
  bundleOrderUpdatesByMaker.queue,
  dynamicOrdersCron.queue,
  erc20OrdersCron.queue,
  expiredOrdersCron.queue,
  oracleOrdersCron.queue,

  orderbookOrders.queue,
  orderbookPostOrderExternal.queue,
  orderbookTokenSets.queue,
  orderbookOpenseaListings.queue,
  orderbookSaveOpenseaWebsocketEvents.queue,

  fetchSourceInfo.queue,

  tokenUpdatesMint.queue,
  tokenRefreshCache.queue,
  fetchCollectionMetadata.queue,
  tokenUpdatesFloorAsk.queue,
  tokenUpdatesNormalizedFloorAsk.queue,

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
  newTopBidTriggerQueue.queue,

  countApiUsage.queue,

  openseaOrdersProcessQueue.queue,
  openseaOrdersFetchQueue.queue,
];
