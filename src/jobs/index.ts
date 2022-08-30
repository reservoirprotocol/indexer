// WARNING! For ease of accounting, make sure to keep the below lists sorted!

// Initialize all background job queues and crons

import "@/jobs/arweave-relay";
import "@/jobs/arweave-sync";
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

// Export all job queues for monitoring through the BullMQ UI

import * as fixActivitiesMissingCollection from "@/jobs/activities/fix-activities-missing-collection";
import * as processActivityEvent from "@/jobs/activities/process-activity-event";
import * as removeUnsyncedEventsActivities from "@/jobs/activities/remove-unsynced-events-activities";

import * as arweaveSyncBackfill from "@/jobs/arweave-sync/backfill-queue";
import * as arweaveSyncRealtime from "@/jobs/arweave-sync/realtime-queue";

import * as backfillSalesUsdPrice from "@/jobs/backfill/backfill-sales-usd-price";
import * as backfillFillEventsUpdatedAt from "@/jobs/backfill/backfill-fill-events-updated-at";

import * as topBidUpdate from "@/jobs/bid-updates/top-bid-update-queue";

import * as collectionsRefresh from "@/jobs/collections-refresh/collections-refresh";
import * as collectionsRefreshCache from "@/jobs/collections-refresh/collections-refresh-cache";

import * as collectionUpdatesFloorAsk from "@/jobs/collection-updates/floor-queue";
import * as collectionUpdatesMetadata from "@/jobs/collection-updates/metadata-queue";
import * as rarity from "@/jobs/collection-updates/rarity-queue";
import * as collectionUpdatesTopBid from "@/jobs/collection-updates/top-bid-queue";

import * as currencies from "@/jobs/currencies/index";

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

import * as updateNftBalanceFloorAskPrice from "@/jobs/nft-balance-updates/update-floor-ask-price-queue";
import * as updateNftBalanceTopBid from "@/jobs/nft-balance-updates/update-top-bid-queue";

import * as orderFixes from "@/jobs/order-fixes/queue";
import * as orderUpdatesById from "@/jobs/order-updates/by-id-queue";
import * as orderUpdatesByMaker from "@/jobs/order-updates/by-maker-queue";
import * as bundleOrderUpdatesByMaker from "@/jobs/order-updates/by-maker-bundle-queue";

import * as orderbookOrders from "@/jobs/orderbook/orders-queue";
import * as orderbookPostOrderExternal from "@/jobs/orderbook/post-order-external";
import * as orderbookTokenSets from "@/jobs/orderbook/token-sets-queue";

import * as fetchSourceInfo from "@/jobs/sources/fetch-source-info";

import * as tokenUpdatesMint from "@/jobs/token-updates/mint-queue";
import * as tokenRefreshCache from "@/jobs/token-updates/token-refresh-cache";
import * as nonFlaggedTokenSet from "@/jobs/token-updates/non-flagged-token-set";
import * as fetchCollectionMetadata from "@/jobs/token-updates/fetch-collection-metadata";
import * as syncTokensFlagStatus from "@/jobs/token-updates/sync-tokens-flag-status";
import * as syncCollectionsFlagStatus from "@/jobs/token-updates/sync-collection-flag-status";

import * as handleNewSellOrder from "@/jobs/update-attribute/handle-new-sell-order";
import * as handleNewBuyOrder from "@/jobs/update-attribute/handle-new-buy-order";
import * as resyncAttributeCache from "@/jobs/update-attribute/resync-attribute-cache";
import * as resyncAttributeCollection from "@/jobs/update-attribute/resync-attribute-collection";
import * as resyncAttributeFloorSell from "@/jobs/update-attribute/resync-attribute-floor-sell";
import * as resyncAttributeKeyCounts from "@/jobs/update-attribute/resync-attribute-key-counts";
import * as resyncAttributeValueCounts from "@/jobs/update-attribute/resync-attribute-value-counts";

export const allJobQueues = [
  fixActivitiesMissingCollection.queue,
  processActivityEvent.queue,
  removeUnsyncedEventsActivities.queue,

  arweaveSyncBackfill.queue,
  arweaveSyncRealtime.queue,

  backfillSalesUsdPrice.queue,
  backfillFillEventsUpdatedAt.queue,

  currencies.queue,

  topBidUpdate.queue,

  collectionsRefresh.queue,
  collectionsRefreshCache.queue,

  collectionUpdatesFloorAsk.queue,
  collectionUpdatesMetadata.queue,
  rarity.queue,
  collectionUpdatesTopBid.queue,

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

  updateNftBalanceFloorAskPrice.queue,
  updateNftBalanceTopBid.queue,

  orderFixes.queue,
  orderUpdatesById.queue,
  orderUpdatesByMaker.queue,
  bundleOrderUpdatesByMaker.queue,

  orderbookOrders.queue,
  orderbookPostOrderExternal.queue,
  orderbookTokenSets.queue,

  fetchSourceInfo.queue,

  tokenUpdatesMint.queue,
  tokenRefreshCache.queue,
  nonFlaggedTokenSet.queue,
  fetchCollectionMetadata.queue,
  syncTokensFlagStatus.queue,
  syncCollectionsFlagStatus.queue,

  handleNewSellOrder.queue,
  handleNewBuyOrder.queue,
  resyncAttributeCache.queue,
  resyncAttributeCollection.queue,
  resyncAttributeFloorSell.queue,
  resyncAttributeKeyCounts.queue,
  resyncAttributeValueCounts.queue,
];
