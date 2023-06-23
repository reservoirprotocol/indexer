// Whenever an order changes its state (eg. a new order comes in,
// a fill/cancel happens, an order gets expired, or an order gets
// revalidated/invalidated due to a change in balance or approval
// we might want to take some actions (eg. update any caches). As
// for events syncing, we have two separate job queues. The first
// one is for handling direct order state changes (cancels, fills
// or expirations - where we know the exact id of the orders that
// are affected), while the other is for indirect change of state
// - where we don't know the exact ids of the affected orders and
// some additional processing is required (eg. on balance changes
// many of the orders of a maker might change their state).

import "@/jobs/order-updates/by-id-queue";
import "@/jobs/order-updates/by-maker-queue";
import "@/jobs/order-updates/save-bid-events";

// Various cron jobs that must run once in a while

import "@/jobs/order-updates/cron/dynamic-orders-queue";
import "@/jobs/order-updates/cron/erc20-orders-queue";
import "@/jobs/order-updates/cron/expired-orders-queue";
import "@/jobs/order-updates/cron/oracle-orders-queue";

// Misc

import "@/jobs/order-updates/misc/blur-bids-buffer";
import "@/jobs/order-updates/misc/blur-bids-refresh";
import "@/jobs/order-updates/misc/blur-listings-refresh";
import "@/jobs/order-updates/misc/opensea-off-chain-cancellations";
