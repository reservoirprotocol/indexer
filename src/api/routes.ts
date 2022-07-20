import { Server } from "@hapi/hapi";

import * as adminEndpoints from "@/api/endpoints/admin";
import * as apiKeysEndpoints from "@/api/endpoints/api-keys";
import * as attributesEndpoints from "@/api/endpoints/attributes";
import * as eventsEndpoints from "@/api/endpoints/events";
import * as executeEndpoints from "@/api/endpoints/execute";
import * as collectionsEndpoints from "@/api/endpoints/collections";
import * as healthEndpoints from "@/api/endpoints/health";
import * as oracleEndpoints from "@/api/endpoints/oracle";
import * as ordersEndpoints from "@/api/endpoints/orders";
import * as ownersEndpoints from "@/api/endpoints/owners";
import * as statsEndpoints from "@/api/endpoints/stats";
import * as tokensEndpoints from "@/api/endpoints/tokens";
import * as transfersEndpoints from "@/api/endpoints/transfers";
import * as redirectsEndpoints from "@/api/endpoints/redirects";
import * as searchEndpoints from "@/api/endpoints/search";
import * as activitiesEndpoints from "@/api/endpoints/activities";

export const setupRoutes = (server: Server) => {
  // Admin

  server.route({
    method: "POST",
    path: "/admin/refresh-token",
    options: adminEndpoints.postRefreshTokenOptions,
  });

  server.route({
    method: "POST",
    path: "/admin/refresh-collection",
    options: adminEndpoints.postRefreshCollectionOptions,
  });

  server.route({
    method: "POST",
    path: "/admin/calc-rarity",
    options: adminEndpoints.postCalcRarityOptions,
  });

  server.route({
    method: "GET",
    path: "/admin/open-api",
    options: adminEndpoints.getOpenApiOptions,
  });

  server.route({
    method: "POST",
    path: "/admin/index-metadata",
    options: adminEndpoints.postMetadataIndexOptions,
  });

  server.route({
    method: "POST",
    path: "/admin/fix-blocks",
    options: adminEndpoints.postFixBlocksOptions,
  });

  server.route({
    method: "POST",
    path: "/admin/fix-cache",
    options: adminEndpoints.postFixCacheOptions,
  });

  server.route({
    method: "POST",
    path: "/admin/fix-token-cache",
    options: adminEndpoints.postFixTokenCacheOptions,
  });

  server.route({
    method: "POST",
    path: "/admin/invalidate-order",
    options: adminEndpoints.postInvalidateOrderOptions,
  });

  server.route({
    method: "POST",
    path: "/admin/fix-orders",
    options: adminEndpoints.postFixOrdersOptions,
  });

  server.route({
    method: "POST",
    path: "/admin/resync-floor-events",
    options: adminEndpoints.postResyncFloorEventsOptions,
  });

  server.route({
    method: "POST",
    path: "/admin/sync-arweave",
    options: adminEndpoints.postSyncArweaveOptions,
  });

  server.route({
    method: "POST",
    path: "/admin/sync-events",
    options: adminEndpoints.postSyncEventsOptions,
  });

  server.route({
    method: "POST",
    path: "/admin/sync-daily-volumes",
    options: adminEndpoints.postSyncDailyVolumes,
  });

  server.route({
    method: "POST",
    path: "/admin/set-community",
    options: adminEndpoints.postSetCollectionCommunity,
  });

  // Api keys

  server.route({
    method: "POST",
    path: "/api-keys",
    options: apiKeysEndpoints.postApiKey,
  });

  // Attributes

  server.route({
    method: "GET",
    path: "/attributes/v1",
    options: attributesEndpoints.getAttributesV1Options,
  });

  server.route({
    method: "GET",
    path: "/collections/{collection}/attributes/all/v1",
    options: attributesEndpoints.getAttributesAllV1Options,
  });

  server.route({
    method: "GET",
    path: "/collections/{collection}/attributes/all/v2",
    options: attributesEndpoints.getAttributesAllV2Options,
  });

  server.route({
    method: "GET",
    path: "/collections/{collection}/attributes/static/v1",
    options: attributesEndpoints.getAttributesStaticV1Options,
  });

  server.route({
    method: "GET",
    path: "/collections/{collection}/attributes/v1",
    options: attributesEndpoints.getCollectionAttributesV1Options,
  });

  server.route({
    method: "GET",
    path: "/collections/{collection}/attributes/explore/v1",
    options: attributesEndpoints.getAttributesExploreV1Options,
  });

  server.route({
    method: "GET",
    path: "/collections/{collection}/attributes/explore/v2",
    options: attributesEndpoints.getAttributesExploreV2Options,
  });

  server.route({
    method: "GET",
    path: "/collections/{collection}/attributes/explore/v3",
    options: attributesEndpoints.getAttributesExploreV3Options,
  });

  // Collections

  server.route({
    method: "GET",
    path: "/collections/v1",
    options: collectionsEndpoints.getCollectionsV1Options,
  });

  server.route({
    method: "GET",
    path: "/collections/v2",
    options: collectionsEndpoints.getCollectionsV2Options,
  });

  server.route({
    method: "GET",
    path: "/collections/v3",
    options: collectionsEndpoints.getCollectionsV3Options,
  });

  server.route({
    method: "GET",
    path: "/collections/v4",
    options: collectionsEndpoints.getCollectionsV4Options,
  });

  server.route({
    method: "GET",
    path: "/collections/{collectionOrSlug}/v1",
    options: collectionsEndpoints.getCollectionDeprecatedV1Options,
  });

  server.route({
    method: "GET",
    path: "/collection/v1",
    options: collectionsEndpoints.getCollectionV1Options,
  });

  server.route({
    method: "GET",
    path: "/collection/v2",
    options: collectionsEndpoints.getCollectionV2Options,
  });

  server.route({
    method: "GET",
    path: "/collection/v3",
    options: collectionsEndpoints.getCollectionV3Options,
  });

  server.route({
    method: "GET",
    path: "/collections/{collection}/top-bids/v1",
    options: collectionsEndpoints.getCollectionTopBidsV1Options,
  });

  server.route({
    method: "GET",
    path: "/users/{user}/collections/v1",
    options: collectionsEndpoints.getUserCollectionsV1Options,
  });

  server.route({
    method: "GET",
    path: "/users/{user}/collections/v2",
    options: collectionsEndpoints.getUserCollectionsV2Options,
  });

  server.route({
    method: "POST",
    path: "/collections/refresh/v1",
    options: collectionsEndpoints.postCollectionsRefreshV1Options,
  });

  server.route({
    method: "GET",
    path: "/collections/daily-volumes/v1",
    options: collectionsEndpoints.getDailyVolumesV1Options,
  });

  server.route({
    method: "GET",
    path: "/collections/{collection}/owners-distribution/v1",
    options: collectionsEndpoints.getCollectionOwnersDistributionV1Options,
  });

  server.route({
    method: "POST",
    path: "/collections-sets/v1",
    options: collectionsEndpoints.postCreateCollectionsSetV1Options,
  });

  // Events

  server.route({
    method: "GET",
    path: "/events/collections/floor-ask/v1",
    options: eventsEndpoints.getCollectionsFloorAskV1Options,
  });

  server.route({
    method: "GET",
    path: "/events/orders/v1",
    options: eventsEndpoints.getOrderEventsV1Options,
  });

  server.route({
    method: "GET",
    path: "/events/tokens/floor-ask/v1",
    options: eventsEndpoints.getTokensFloorAskV1Options,
  });

  server.route({
    method: "GET",
    path: "/events/tokens/floor-ask/v2",
    options: eventsEndpoints.getTokensFloorAskV2Options,
  });

  // Execute

  server.route({
    method: "GET",
    path: "/execute/bid/v1",
    options: executeEndpoints.getExecuteBidV1Options,
  });

  server.route({
    method: "GET",
    path: "/execute/bid/v2",
    options: executeEndpoints.getExecuteBidV2Options,
  });

  server.route({
    method: "GET",
    path: "/execute/buy/v1",
    options: executeEndpoints.getExecuteBuyV1Options,
  });

  server.route({
    method: "GET",
    path: "/execute/buy/v2",
    options: executeEndpoints.getExecuteBuyV2Options,
  });

  server.route({
    method: "GET",
    path: "/execute/cancel/v1",
    options: executeEndpoints.getExecuteCancelV1Options,
  });

  server.route({
    method: "GET",
    path: "/execute/list/v1",
    options: executeEndpoints.getExecuteListV1Options,
  });

  server.route({
    method: "GET",
    path: "/execute/list/v2",
    options: executeEndpoints.getExecuteListV2Options,
  });

  server.route({
    method: "GET",
    path: "/execute/sell/v1",
    options: executeEndpoints.getExecuteSellV1Options,
  });

  server.route({
    method: "GET",
    path: "/execute/sell/v2",
    options: executeEndpoints.getExecuteSellV2Options,
  });

  // Oracle

  server.route({
    method: "GET",
    path: "/oracle/collections/{collection}/floor-ask/v1",
    options: oracleEndpoints.getCollectionFloorAskOracleV1Options,
  });

  // Orders

  server.route({
    method: "GET",
    path: "/orders/v1",
    options: ordersEndpoints.getOrdersV1Options,
  });

  server.route({
    method: "GET",
    path: "/orders/v2",
    options: ordersEndpoints.getOrdersV2Options,
  });

  server.route({
    method: "GET",
    path: "/orders/all/v1",
    options: ordersEndpoints.getOrdersAllV1Options,
  });

  server.route({
    method: "GET",
    path: "/orders/asks/v1",
    options: ordersEndpoints.getOrdersAsksV1Options,
  });

  server.route({
    method: "GET",
    path: "/orders/asks/v2",
    options: ordersEndpoints.getOrdersAsksV2Options,
  });

  server.route({
    method: "GET",
    path: "/orders/bids/v1",
    options: ordersEndpoints.getOrdersBidsV1Options,
  });

  server.route({
    method: "GET",
    path: "/orders/bids/v2",
    options: ordersEndpoints.getOrdersBidsV2Options,
  });

  server.route({
    method: "GET",
    path: "/orders/executed/v1",
    options: ordersEndpoints.getOrderExecutedV1Options,
  });

  server.route({
    method: "GET",
    path: "/users/{user}/positions/v1",
    options: ordersEndpoints.getUserPositionsV1Options,
  });

  server.route({
    method: "GET",
    path: "/liquidity/users/v1",
    options: ordersEndpoints.getUsersLiquidityV1Options,
  });

  server.route({
    method: "POST",
    path: "/order/v1",
    options: ordersEndpoints.postOrderV1Options,
  });

  server.route({
    method: "POST",
    path: "/order/v2",
    options: ordersEndpoints.postOrderV2Options,
  });

  server.route({
    method: "POST",
    path: "/orders/v1",
    options: ordersEndpoints.postOrdersV1Options,
  });

  // Owners

  server.route({
    method: "GET",
    path: "/owners/v1",
    options: ownersEndpoints.getOwnersV1Options,
  });

  server.route({
    method: "GET",
    path: "/owners/cross-collections/v1",
    options: ownersEndpoints.getCrossCollectionsOwnersV1Options,
  });

  server.route({
    method: "GET",
    path: "/owners/common-collections/v1",
    options: ownersEndpoints.getCommonCollectionsOwnersV1Options,
  });

  // Stats

  server.route({
    method: "GET",
    path: "/stats/v1",
    options: statsEndpoints.getStatsV1Options,
  });

  // Tokens

  server.route({
    method: "GET",
    path: "/tokens/v1",
    options: tokensEndpoints.getTokensV1Options,
  });

  server.route({
    method: "GET",
    path: "/tokens/v2",
    options: tokensEndpoints.getTokensV2Options,
  });

  server.route({
    method: "GET",
    path: "/tokens/v3",
    options: tokensEndpoints.getTokensV3Options,
  });

  server.route({
    method: "GET",
    path: "/tokens/v4",
    options: tokensEndpoints.getTokensV4Options,
  });

  server.route({
    method: "GET",
    path: "/tokens/bootstrap/v1",
    options: tokensEndpoints.getTokensBootstrapV1Options,
  });

  server.route({
    method: "GET",
    path: "/tokens/details/v1",
    options: tokensEndpoints.getTokensDetailsV1Options,
  });

  server.route({
    method: "GET",
    path: "/tokens/details/v2",
    options: tokensEndpoints.getTokensDetailsV2Options,
  });

  server.route({
    method: "GET",
    path: "/tokens/details/v3",
    options: tokensEndpoints.getTokensDetailsV3Options,
  });

  server.route({
    method: "GET",
    path: "/tokens/details/v4",
    options: tokensEndpoints.getTokensDetailsV4Options,
  });

  server.route({
    method: "GET",
    path: "/tokens/floor/v1",
    options: tokensEndpoints.getTokensFloorV1Options,
  });

  server.route({
    method: "GET",
    path: "/users/{user}/tokens/v1",
    options: tokensEndpoints.getUserTokensV1Options,
  });

  server.route({
    method: "GET",
    path: "/users/{user}/tokens/v2",
    options: tokensEndpoints.getUserTokensV2Options,
  });

  server.route({
    method: "POST",
    path: "/tokens/refresh/v1",
    options: tokensEndpoints.postTokensRefreshV1Options,
  });

  server.route({
    method: "POST",
    path: "/tokens/simulate-floor/v1",
    options: tokensEndpoints.postSimulateFloorV1Options,
  });

  // Token sets

  server.route({
    method: "POST",
    path: "/token-sets/v1",
    options: tokensEndpoints.postTokenSetsV1Options,
  });

  // Transfers

  server.route({
    method: "GET",
    path: "/sales/v1",
    options: transfersEndpoints.getSalesV1Options,
  });

  server.route({
    method: "GET",
    path: "/sales/v2",
    options: transfersEndpoints.getSalesV2Options,
  });

  server.route({
    method: "GET",
    path: "/sales/v3",
    options: transfersEndpoints.getSalesV3Options,
  });

  server.route({
    method: "GET",
    path: "/sales/bulk/v1",
    options: transfersEndpoints.getSalesBulkV1Options,
  });

  server.route({
    method: "GET",
    path: "/transfers/v1",
    options: transfersEndpoints.getTransfersV1Options,
  });

  server.route({
    method: "GET",
    path: "/transfers/v2",
    options: transfersEndpoints.getTransfersV2Options,
  });

  server.route({
    method: "GET",
    path: "/transfers/bulk/v1",
    options: transfersEndpoints.getTransfersBulkV1Options,
  });

  // Redirects
  server.route({
    method: "GET",
    path: "/redirect/logo/v1",
    options: redirectsEndpoints.getRedirectLogoV1Options,
  });

  server.route({
    method: "GET",
    path: "/redirect/sources/{source}/logo/v2",
    options: redirectsEndpoints.getRedirectLogoV2Options,
  });

  server.route({
    method: "GET",
    path: "/redirect/token/v1",
    options: redirectsEndpoints.getRedirectTokenV1Options,
  });

  server.route({
    method: "GET",
    path: "/redirect/sources/{source}/tokens/{token}/link/v2",
    options: redirectsEndpoints.getRedirectTokenV2Options,
  });

  server.route({
    method: "GET",
    path: "/redirect/tokens/{token}/image/v1",
    options: redirectsEndpoints.getRedirectTokenImageV1Options,
  });

  server.route({
    method: "GET",
    path: "/redirect/collections/{collection}/image/v1",
    options: redirectsEndpoints.getRedirectCollectionImageV1Options,
  });

  // Activity

  server.route({
    method: "GET",
    path: "/collections/{collection}/activity/v1",
    options: activitiesEndpoints.getCollectionActivityV1Options,
  });

  server.route({
    method: "GET",
    path: "/tokens/{token}/activity/v1",
    options: activitiesEndpoints.getTokenActivityV1Options,
  });

  server.route({
    method: "GET",
    path: "/users/{user}/activity/v1",
    options: activitiesEndpoints.getUserActivityV1Options,
  });

  server.route({
    method: "GET",
    path: "/activity/v1",
    options: activitiesEndpoints.getActivityV1Options,
  });

  // Search

  server.route({
    method: "GET",
    path: "/search/collections/v1",
    options: searchEndpoints.getSearchCollectionsV1Options,
  });

  // Health

  // Both readyz and livez endpoints point to the same handler, maybe at some point we want to separate the logic
  // readyz: when can container be added to the load balancer and receive traffic
  // livez: during the lifetime of the container do checks to see if the container is still responsive

  server.route({
    method: "GET",
    path: "/livez",
    options: healthEndpoints.getLiveOptions,
  });

  server.route({
    method: "GET",
    path: "/readyz",
    options: healthEndpoints.getLiveOptions,
  });
};
