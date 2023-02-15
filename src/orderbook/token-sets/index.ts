// Whenever a new kind of token set is added, make sure to implement
// a metadata/criteria builder for it (used in various APIs we have):
// /src/utils/orders.ts

export * as contractWide from "@/orderbook/token-sets/contract-wide";
export * as dynamicCollectionNonFlagged from "@/orderbook/token-sets/dynamic/collection-non-flagged";
export * as mixedTokenList from "@/orderbook/token-sets/mixed-token-list";
export * as singleToken from "@/orderbook/token-sets/single-token";
export * as tokenList from "@/orderbook/token-sets/token-list";
export * as tokenRange from "@/orderbook/token-sets/token-range";
