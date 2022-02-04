import { Server } from "@hapi/hapi";

import * as adminEndpoints from "@/api/endpoints/admin";
import * as attributesEndpoints from "@/api/endpoints/attributes";
import * as collectionsEndpoints from "@/api/endpoints/collections";
import * as executeEndpoints from "@/api/endpoints/execute";
import * as ordersEndpoints from "@/api/endpoints/orders";
import * as ownersEndpoints from "@/api/endpoints/owners";
import * as rootEndpoints from "@/api/endpoints/root";
import * as statsEndpoints from "@/api/endpoints/stats";
import * as tokensEndpoints from "@/api/endpoints/tokens";
import * as transfersEndpoints from "@/api/endpoints/transfers";
import * as healthEndpoints from "@/api/endpoints/health";

export const setupRoutes = (server: Server) => {
  // Root

  server.route({
    method: "GET",
    path: "/",
    options: rootEndpoints.pingOptions,
  });

  // Admin

  server.route({
    method: "POST",
    path: "/admin/contracts",
    options: adminEndpoints.postContractsOptions,
  });

  server.route({
    method: "POST",
    path: "/admin/disable/orders",
    options: adminEndpoints.postDisableOrdersOptions,
  });

  server.route({
    method: "POST",
    path: "/admin/fetch/blocks",
    options: adminEndpoints.postFetchBlocksOptions,
  });

  server.route({
    method: "POST",
    path: "/admin/fix/cache",
    options: adminEndpoints.postFixCacheOptions,
  });

  server.route({
    method: "POST",
    path: "/admin/index/metadata",
    options: adminEndpoints.postIndexMetadataOptions,
  });

  server.route({
    method: "POST",
    path: "/admin/index/metadata/fast",
    options: adminEndpoints.postIndexMetadataOptions,
  });

  server.route({
    method: "POST",
    path: "/admin/sync/events",
    options: adminEndpoints.postSyncEventsOptions,
  });

  server.route({
    method: "POST",
    path: "/admin/sync/orders",
    options: adminEndpoints.postSyncOrdersOptions,
  });

  // Attributes

  server.route({
    method: "GET",
    path: "/attributes",
    options: attributesEndpoints.getAttributesOptions,
  });

  server.route({
    method: "GET",
    path: "/collections/{collection}/attributes",
    options: attributesEndpoints.getCollectionAttributesOptions,
  });

  server.route({
    method: "POST",
    path: "/attributes/refresh",
    options: attributesEndpoints.postAttributesRefreshOptions,
  });

  // Collections

  server.route({
    method: "GET",
    path: "/collections",
    options: collectionsEndpoints.getCollectionsOptions,
  });

  server.route({
    method: "GET",
    path: "/collections/{collection}",
    options: collectionsEndpoints.getCollectionOptions,
  });

  server.route({
    method: "GET",
    path: "/collections/{collection}/top-buys",
    options: collectionsEndpoints.getCollectionTopBuysOptions,
  });

  server.route({
    method: "GET",
    path: "/users/{user}/collections",
    options: collectionsEndpoints.getUserCollectionsOptions,
  });

  // Execute

  server.route({
    method: "GET",
    path: "/execute/fill",
    options: executeEndpoints.getExecuteFillOptions,
  });

  // Orders

  server.route({
    method: "POST",
    path: "/orders",
    options: ordersEndpoints.postOrdersOptions,
  });

  server.route({
    method: "GET",
    path: "/orders",
    options: ordersEndpoints.getOrdersOptions,
  });

  server.route({
    method: "GET",
    path: "/orders/all",
    options: ordersEndpoints.getOrdersAllOptions,
  });

  server.route({
    method: "GET",
    path: "/orders/build",
    options: ordersEndpoints.getOrdersBuildOptions,
  });

  server.route({
    method: "GET",
    path: "/orders/fill",
    options: ordersEndpoints.getOrdersFillOptions,
  });

  server.route({
    method: "GET",
    path: "/market",
    options: ordersEndpoints.getMarketOptions,
  });

  server.route({
    method: "GET",
    path: "/users/{user}/positions",
    options: ordersEndpoints.getUserPositionsOptions,
  });

  server.route({
    method: "GET",
    path: "/liquidity/users",
    options: ordersEndpoints.getUsersLiquidityOptions,
  });

  server.route({
    method: "GET",
    path: "/liquidity/collections",
    options: ordersEndpoints.getCollectionsLiquidityOptions,
  });

  // Owners

  server.route({
    method: "GET",
    path: "/owners",
    options: ownersEndpoints.getOwnersOptions,
  });

  // Stats

  server.route({
    method: "GET",
    path: "/stats",
    options: statsEndpoints.getStatsOptions,
  });

  // Tokens

  server.route({
    method: "GET",
    path: "/tokens",
    options: tokensEndpoints.getTokensOptions,
  });

  server.route({
    method: "GET",
    path: "/tokens/details",
    options: tokensEndpoints.getTokensDetailsOptions,
  });

  server.route({
    method: "GET",
    path: "/tokens/floor",
    options: tokensEndpoints.getTokensFloorOptions,
  });

  server.route({
    method: "GET",
    path: "/users/{user}/tokens",
    options: tokensEndpoints.getUserTokensOptions,
  });

  // Transfers

  server.route({
    method: "GET",
    path: "/sales",
    options: transfersEndpoints.getSalesOptions,
  });

  server.route({
    method: "GET",
    path: "/transfers",
    options: transfersEndpoints.getTransfersOptions,
  });

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
