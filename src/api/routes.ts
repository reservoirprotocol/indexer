import { Server } from "@hapi/hapi";

import * as adminEndpoints from "@/api/endpoints/admin";
import * as apiKeysEndpoints from "@/api/endpoints/api-keys";
import * as attributesEndpoints from "@/api/endpoints/attributes";
import * as eventsEndpoints from "@/api/endpoints/events";
import * as executeEndpoints from "@/api/endpoints/execute";
import * as collectionsEndpoints from "@/api/endpoints/collections";
import * as healthEndpoints from "@/api/endpoints/health";
import * as ordersEndpoints from "@/api/endpoints/orders";
import * as ownersEndpoints from "@/api/endpoints/owners";
import * as statsEndpoints from "@/api/endpoints/stats";
import * as tokensEndpoints from "@/api/endpoints/tokens";
import * as transfersEndpoints from "@/api/endpoints/transfers";

export const setupRoutes = (server: Server) => {
  // Admin

  server.route({
    method: "POST",
    path: "/admin/index-metadata",
    options: adminEndpoints.postMetadataIndexOptions,
  });

  server.route({
    method: "POST",
    path: "/admin/fix-cache",
    options: adminEndpoints.postFixCacheOptions,
  });

  server.route({
    method: "POST",
    path: "/admin/fix-orders",
    options: adminEndpoints.postFixOrdersOptions,
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
    path: "/collections/{collection}/attributes/v1",
    options: attributesEndpoints.getCollectionAttributesV1Options,
  });

  // Collections

  server.route({
    method: "GET",
    path: "/collections/v1",
    options: collectionsEndpoints.getCollectionsV1Options,
  });

  server.route({
    method: "GET",
    path: "/collections/{collectionOrSlug}/v1",
    options: collectionsEndpoints.getCollectionV1Options,
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

  // Events

  server.route({
    method: "GET",
    path: "/events/tokens/floor-ask/v1",
    options: eventsEndpoints.getTokensFloorAskV1Options,
  });

  // Execute

  server.route({
    method: "GET",
    path: "/execute/bid/v1",
    options: executeEndpoints.getExecuteBidV1Options,
  });

  server.route({
    method: "GET",
    path: "/execute/buy/v1",
    options: executeEndpoints.getExecuteBuyV1Options,
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
    path: "/execute/sell/v1",
    options: executeEndpoints.getExecuteSellV1Options,
  });

  // Orders

  server.route({
    method: "GET",
    path: "/orders/v1",
    options: ordersEndpoints.getOrdersV1Options,
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
    path: "/orders/bids/v1",
    options: ordersEndpoints.getOrdersBidsV1Options,
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
    path: "/orders/v1",
    options: ordersEndpoints.postOrdersV1Options,
  });

  // Owners

  server.route({
    method: "GET",
    path: "/owners/v1",
    options: ownersEndpoints.getOwnersV1Options,
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
    path: "/transfers/v1",
    options: transfersEndpoints.getTransfersV1Options,
  });

  server.route({
    method: "GET",
    path: "/transfers/v2",
    options: transfersEndpoints.getTransfersV2Options,
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
