// TODO: The initial idea was to have common methods for mapping events
// to underlying database tables together with any additional processes
// like changing order statuses given those events (eg. mark the orders
// as filled/cancelled). However, the minor differences in handling the
// different exchanges made these common methods quite messy. We should
// still have common methods when that's the case, but we should derive
// the logic into an exchange-specific method when the behaviour is too
// different from the common case.

export * as bulkCancels from "@/events-sync/storage/bulk-cancel-events";
export * as cancels from "@/events-sync/storage/cancel-events";
export * as fills from "@/events-sync/storage/fill-events";
export * as ftTransfers from "@/events-sync/storage/ft-transfer-events";
export * as nftApprovals from "@/events-sync/storage/nft-approval-events";
export * as nftTransfers from "@/events-sync/storage/nft-transfer-events";
export * as nonceCancels from "@/events-sync/storage/nonce-cancel-events";
