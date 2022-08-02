// WARNING! For ease of accounting, make sure to keep the below lists sorted!

// Initialize all background job queues and crons

import "@/jobs/arweave-relay";
import "@/jobs/arweave-sync";
import "@/jobs/backfill";
import "@/jobs/bid-updates";
import "@/jobs/cache-check";
import "@/jobs/collections-refresh";
import "@/jobs/collection-updates";
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

// Export all job queues for monitoring through the BullMQ UI

import * as fixActivitiesMissingCollection from "@/jobs/activities/fix-activities-missing-collection";
import * as processActivityEvent from "@/jobs/activities/process-activity-event";
import * as removeUnsyncedEventsActivities from "@/jobs/activities/remove-unsynced-events-activities";

import * as arweaveSyncBackfill from "@/jobs/arweave-sync/backfill-queue";
import * as arweaveSyncRealtime from "@/jobs/arweave-sync/realtime-queue";

import * as backfillBlockTimestamps from "@/jobs/backfill/backfill-block-timestamps";
import * as backfillCancelWyvernV23Orders from "@/jobs/backfill/backfill-cancel-wyvern-v23-orders";
import * as backfillFillEventsCreatedAt from "@/jobs/backfill/backfill-fill-events-created-at";
import * as backfillFillEventsFillSource from "@/jobs/backfill/backfill-fill-events-fill-source";
import * as backfillFillEventsOrderSource from "@/jobs/backfill/backfill-fill-events-order-source";
import * as backfillFillEventsWashTradingScore from "@/jobs/backfill/backfill-fill-events-wash-trading-score";
import * as backfillLooksRareFills from "@/jobs/backfill/backfill-looks-rare-fills";
import * as backfillTransactionBlockFields from "@/jobs/backfill/backfill-transaction-block-fields";
import * as backfillTransactions from "@/jobs/backfill/backfill-transactions";

import * as topBidUpdate from "@/jobs/bid-updates/top-bid-update-queue";

import * as collectionsRefresh from "@/jobs/collections-refresh/collections-refresh";
import * as collectionsRefreshCache from "@/jobs/collections-refresh/collections-refresh-cache";

import * as collectionUpdatesFloorAsk from "@/jobs/collection-updates/floor-queue";
import * as collectionUpdatesMetadata from "@/jobs/collection-updates/metadata-queue";
import * as rarity from "@/jobs/collection-updates/rarity-queue";

import * as dailyVolumes from "@/jobs/daily-volumes/daily-volumes";

import * as exportData from "@/jobs/data-export/export-data";

import * as eventsSyncBackfill from "@/jobs/events-sync/backfill-queue";
import * as eventsSyncBlockCheck from "@/jobs/events-sync/block-check-queue";
import * as eventsSyncRealtime from "@/jobs/events-sync/realtime-queue";
import * as eventsSyncFtTransfersWriteBuffer from "@/jobs/events-sync/write-buffers/ft-transfers";
import * as eventsSyncNftTransfersWriteBuffer from "@/jobs/events-sync/write-buffers/nft-transfers";

import * as fillUpdates from "@/jobs/fill-updates/queue";

import * as metadataIndexFetch from "@/jobs/metadata-index/fetch-queue";
import * as metadataIndexProcess from "@/jobs/metadata-index/process-queue";
import * as metadataIndexWrite from "@/jobs/metadata-index/write-queue";

import * as backfillAcquiredAt from "@/jobs/nft-balance-updates/backfill-acquired-at-queue";
import * as backfillNftBalanceFloorAskPrice from "@/jobs/nft-balance-updates/backfill-floor-ask-price-queue";
import * as backfillNftBalanceTopBid from "@/jobs/nft-balance-updates/backfill-top-bid-queue";
import * as updateNftBalanceFloorAskPrice from "@/jobs/nft-balance-updates/update-floor-ask-price-queue";
import * as updateNftBalanceTopBid from "@/jobs/nft-balance-updates/update-top-bid-queue";

import * as orderFixes from "@/jobs/order-fixes/queue";
import * as orderUpdatesById from "@/jobs/order-updates/by-id-queue";
import * as orderUpdatesByMaker from "@/jobs/order-updates/by-maker-queue";
import * as bundleOrderUpdatesByMaker from "@/jobs/order-updates/by-maker-bundle-queue";
import * as removeBuyOrderEvents from "@/jobs/order-updates/remove-buy-order-events";

import * as orderbookOrders from "@/jobs/orderbook/orders-queue";
import * as orderbookPostOrderExternal from "@/jobs/orderbook/post-order-external";
import * as resyncOrdersSource from "@/jobs/orderbook/resync-orders-source";
import * as orderbookTokenSets from "@/jobs/orderbook/token-sets-queue";

import * as tokenUpdatesMint from "@/jobs/token-updates/mint-queue";
import * as tokenRefreshCache from "@/jobs/token-updates/token-refresh-cache";

import * as handleNewSellOrder from "@/jobs/update-attribute/handle-new-sell-order";
import * as handleNewBuyOrder from "@/jobs/update-attribute/handle-new-buy-order";
import * as resyncAttributeCache from "@/jobs/update-attribute/resync-attribute-cache";
import * as resyncAttributeCollection from "@/jobs/update-attribute/resync-attribute-collection";
import * as resyncAttributeFloorSell from "@/jobs/update-attribute/resync-attribute-floor-sell";
import * as resyncAttributeKeyCounts from "@/jobs/update-attribute/resync-attribute-key-counts";
import * as resyncAttributeValueCounts from "@/jobs/update-attribute/resync-attribute-value-counts";

import * as fetchSourceInfo from "@/jobs/sources/fetch-source-info";

export const allJobQueues = [
  fixActivitiesMissingCollection.queue,
  processActivityEvent.queue,
  removeUnsyncedEventsActivities.queue,

  arweaveSyncBackfill.queue,
  arweaveSyncRealtime.queue,

  backfillBlockTimestamps.queue,
  backfillCancelWyvernV23Orders.queue,
  backfillFillEventsCreatedAt.queue,
  backfillFillEventsFillSource.queue,
  backfillFillEventsOrderSource.queue,
  backfillFillEventsWashTradingScore.queue,
  backfillLooksRareFills.queue,
  backfillTransactionBlockFields.queue,
  backfillTransactions.queue,

  topBidUpdate.queue,

  collectionsRefresh.queue,
  collectionsRefreshCache.queue,

  collectionUpdatesFloorAsk.queue,
  collectionUpdatesMetadata.queue,
  rarity.queue,

  dailyVolumes.queue,

  exportData.queue,

  eventsSyncBackfill.queue,
  eventsSyncBlockCheck.queue,
  eventsSyncRealtime.queue,
  eventsSyncFtTransfersWriteBuffer.queue,
  eventsSyncNftTransfersWriteBuffer.queue,

  fillUpdates.queue,

  metadataIndexFetch.queue,
  metadataIndexProcess.queue,
  metadataIndexWrite.queue,

  backfillAcquiredAt.queue,
  backfillNftBalanceFloorAskPrice.queue,
  backfillNftBalanceTopBid.queue,
  updateNftBalanceFloorAskPrice.queue,
  updateNftBalanceTopBid.queue,

  orderFixes.queue,
  orderUpdatesById.queue,
  orderUpdatesByMaker.queue,
  bundleOrderUpdatesByMaker.queue,
  removeBuyOrderEvents.queue,

  orderbookOrders.queue,
  orderbookPostOrderExternal.queue,
  orderbookTokenSets.queue,
  resyncOrdersSource.queue,

  tokenUpdatesMint.queue,
  tokenRefreshCache.queue,

  handleNewSellOrder.queue,
  handleNewBuyOrder.queue,
  resyncAttributeCache.queue,
  resyncAttributeCollection.queue,
  resyncAttributeFloorSell.queue,
  resyncAttributeKeyCounts.queue,
  resyncAttributeValueCounts.queue,

  orderbookPostOrderExternal.queue,

  fetchSourceInfo.queue,
];
