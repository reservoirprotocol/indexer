import { Server } from "@hapi/hapi";

import { config } from "@/config/index";

import * as activitiesEndpoints from "@/api/endpoints/activities";
import * as adminEndpoints from "@/api/endpoints/admin";
import * as apiKeysEndpoints from "@/api/endpoints/api-keys";
import * as attributesEndpoints from "@/api/endpoints/attributes";
import * as collectionsEndpoints from "@/api/endpoints/collections";
import * as collectionsSetsEndpoints from "@/api/endpoints/collections-sets";
import * as contractsSetsEndpoints from "@/api/endpoints/contracts-sets";
import * as eventsEndpoints from "@/api/endpoints/events";
import * as executeEndpoints from "@/api/endpoints/execute";
import * as healthEndpoints from "@/api/endpoints/health";
import * as managementEndpoints from "@/api/endpoints/management";
import * as oracleEndpoints from "@/api/endpoints/oracle";
import * as ordersEndpoints from "@/api/endpoints/orders";
import * as ownersEndpoints from "@/api/endpoints/owners";
import * as redirectsEndpoints from "@/api/endpoints/redirects";
import * as searchEndpoints from "@/api/endpoints/search";
import * as statsEndpoints from "@/api/endpoints/stats";
import * as tokensEndpoints from "@/api/endpoints/tokens";
import * as transactionsEndpoints from "@/api/endpoints/transactions";
import * as transfersEndpoints from "@/api/endpoints/transfers";
import * as syncEndpoints from "@/api/endpoints/sync";
import * as assetsEndpoints from "@/api/endpoints/assets";
import * as sourcesEndpoints from "@/api/endpoints/sources";
import * as chainEndpoints from "@/api/endpoints/chain";
import * as debugEndpoints from "@/api/endpoints/debug";
import * as currenciesEndpoints from "@/api/endpoints/currencies";

export const setupRoutes = (server: Server) => {
  // Activity

  server.route({
    method: "GET",
    path: "/collections/{collection}/activity/v1",
    options: activitiesEndpoints.getCollectionActivityV1Options,
  });

  server.route({
    method: "GET",
    path: "/collections/{collection}/activity/v2",
    options: activitiesEndpoints.getCollectionActivityV2Options,
  });

  server.route({
    method: "GET",
    path: "/collections/{collection}/activity/v3",
    options: activitiesEndpoints.getCollectionActivityV3Options,
  });

  server.route({
    method: "GET",
    path: "/collections/activity/v4",
    options: activitiesEndpoints.getCollectionActivityV4Options,
  });

  server.route({
    method: "GET",
    path: "/collections/activity/v5",
    options: activitiesEndpoints.getCollectionActivityV5Options,
  });

  server.route({
    method: "GET",
    path: "/collections/activity/v6",
    options: activitiesEndpoints.getCollectionActivityV6Options,
  });

  server.route({
    method: "GET",
    path: "/tokens/{token}/activity/v1",
    options: activitiesEndpoints.getTokenActivityV1Options,
  });

  server.route({
    method: "GET",
    path: "/tokens/{token}/activity/v2",
    options: activitiesEndpoints.getTokenActivityV2Options,
  });

  server.route({
    method: "GET",
    path: "/tokens/{token}/activity/v3",
    options: activitiesEndpoints.getTokenActivityV3Options,
  });

  server.route({
    method: "GET",
    path: "/tokens/{token}/activity/v4",
    options: activitiesEndpoints.getTokenActivityV4Options,
  });

  server.route({
    method: "GET",
    path: "/tokens/{token}/activity/v5",
    options: activitiesEndpoints.getTokenActivityV5Options,
  });

  server.route({
    method: "GET",
    path: "/users/{user}/activity/v1",
    options: activitiesEndpoints.getUserActivityV1Options,
  });

  server.route({
    method: "GET",
    path: "/users/activity/v2",
    options: activitiesEndpoints.getUserActivityV2Options,
  });

  server.route({
    method: "GET",
    path: "/users/activity/v3",
    options: activitiesEndpoints.getUserActivityV3Options,
  });

  server.route({
    method: "GET",
    path: "/users/activity/v4",
    options: activitiesEndpoints.getUserActivityV4Options,
  });

  server.route({
    method: "GET",
    path: "/users/activity/v5",
    options: activitiesEndpoints.getUserActivityV5Options,
  });

  server.route({
    method: "GET",
    path: "/users/activity/v6",
    options: activitiesEndpoints.getUserActivityV6Options,
  });

  // Admin

  server.route({
    method: "POST",
    path: "/admin/resync-api-key",
    options: adminEndpoints.postResyncApiKey,
  });

  server.route({
    method: "POST",
    path: "/admin/resync-user-balance",
    options: adminEndpoints.postResyncUserCollectionBalance,
  });

  server.route({
    method: "POST",
    path: "/admin/retry-rabbit-queue",
    options: adminEndpoints.postRetryRabbitQueue,
  });

  server.route({
    method: "POST",
    path: "/admin/pause-rabbit-queue",
    options: adminEndpoints.postPauseRabbitQueueOptions,
  });

  server.route({
    method: "POST",
    path: "/admin/resume-rabbit-queue",
    options: adminEndpoints.postResumeRabbitQueueOptions,
  });

  server.route({
    method: "POST",
    path: "/admin/api-keys/metrics",
    options: adminEndpoints.postApiKeyMetrics,
  });

  server.route({
    method: "POST",
    path: "/admin/delete-rate-limit-rule",
    options: adminEndpoints.postDeleteRateLimitRuleOptions,
  });

  server.route({
    method: "POST",
    path: "/admin/create-rate-limit-rule",
    options: adminEndpoints.postCreateRateLimitRuleOptions,
  });

  server.route({
    method: "POST",
    path: "/admin/update-rate-limit-rule",
    options: adminEndpoints.postUpdateRateLimitRuleOptions,
  });

  server.route({
    method: "GET",
    path: "/admin/rate-limit-rules",
    options: adminEndpoints.getRateLimitRulesOptions,
  });

  server.route({
    method: "GET",
    path: "/admin/provider-metadata/{type}",
    options: adminEndpoints.getProviderMetadata,
  });

  server.route({
    method: "POST",
    path: "/admin/update-api-key",
    options: adminEndpoints.postUpdateApiKeyOptions,
  });

  server.route({
    method: "POST",
    path: "/admin/update-source",
    options: adminEndpoints.postUpdateSourceOptions,
  });

  server.route({
    method: "POST",
    path: "/admin/trigger-job",
    options: adminEndpoints.postTriggerJobOptions,
  });

  server.route({
    method: "POST",
    path: "/admin/trigger-rabbit-job",
    options: adminEndpoints.postTriggerRabbitJobOptions,
  });

  server.route({
    method: "POST",
    path: "/admin/resync-source",
    options: adminEndpoints.postResyncSourceOptions,
  });

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
    path: "/admin/update-image-version",
    options: adminEndpoints.postUpdateImageVersionOptions,
  });

  server.route({
    method: "POST",
    path: "/admin/revalidate-mint",
    options: adminEndpoints.postRevalidateMintOptions,
  });

  server.route({
    method: "POST",
    path: "/admin/revalidate-order",
    options: adminEndpoints.postRevalidateOrderOptions,
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
    path: "/admin/resync-nft-balances",
    options: adminEndpoints.postResyncNftBalances,
  });

  server.route({
    method: "POST",
    path: "/admin/resync-sale-royalties",
    options: adminEndpoints.postResyncSaleRoyalties,
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

  server.route({
    method: "GET",
    path: "/admin/get-marketplaces",
    options: adminEndpoints.getMarketplaces,
  });

  server.route({
    method: "POST",
    path: "/admin/routers",
    options: adminEndpoints.postRoutersOptions,
  });

  server.route({
    method: "GET",
    path: "/admin/get-api-key/{key}",
    options: adminEndpoints.getApiKeyDetails,
  });

  // API keys

  server.route({
    method: "POST",
    path: "/api-keys",
    options: apiKeysEndpoints.postApiKey,
  });

  server.route({
    method: "GET",
    path: "/api-keys/{key}/rate-limits",
    options: apiKeysEndpoints.getApiKeyRateLimits,
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
    path: "/collections/{collection}/attributes/all/v3",
    options: attributesEndpoints.getAttributesAllV3Options,
  });

  server.route({
    method: "GET",
    path: "/collections/{collection}/attributes/all/v4",
    options: attributesEndpoints.getAttributesAllV4Options,
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

  server.route({
    method: "GET",
    path: "/collections/{collection}/attributes/explore/v4",
    options: attributesEndpoints.getAttributesExploreV4Options,
  });

  server.route({
    method: "GET",
    path: "/collections/{collection}/attributes/explore/v5",
    options: attributesEndpoints.getAttributesExploreV5Options,
  });

  // Collections

  server.route({
    method: "POST",
    path: "/collections/{collection}/override/v1",
    options: collectionsEndpoints.postCollectionsOverrideV1Options,
  });

  server.route({
    method: "GET",
    path: "/collections/sources/v1",
    options: collectionsEndpoints.getSourcesListingsV1Options,
  });

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
    path: "/collections/v5",
    options: collectionsEndpoints.getCollectionsV5Options,
  });

  server.route({
    method: "GET",
    path: "/collections/v6",
    options: collectionsEndpoints.getCollectionsV6Options,
  });

  server.route({
    method: "GET",
    path: "/collections/v7",
    options: collectionsEndpoints.getCollectionsV7Options,
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
    path: "/collections/top-selling/v1",
    options: collectionsEndpoints.getTopSellingCollectionsV1Options,
  });

  server.route({
    method: "GET",
    path: "/collections/top-selling/v2",
    options: collectionsEndpoints.getTopSellingCollectionsV2Options,
  });

  server.route({
    method: "GET",
    path: "/collections/trending-mints/v1",
    options: collectionsEndpoints.getTrendingMintsV1Options,
  });

  server.route({
    method: "GET",
    path: "/collections/trending/v1",
    options: collectionsEndpoints.getTrendingCollectionsV1Options,
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
    method: "GET",
    path: "/users/{user}/collections/v3",
    options: collectionsEndpoints.getUserCollectionsV3Options,
  });

  server.route({
    method: "POST",
    path: "/collections/refresh/v1",
    options: collectionsEndpoints.postCollectionsRefreshV1Options,
  });

  server.route({
    method: "POST",
    path: "/collections/refresh/v2",
    options: collectionsEndpoints.postCollectionsRefreshV2Options,
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
    method: "GET",
    path: "/collections/{collection}/top-traders/v1",
    options: collectionsEndpoints.getCollectionTopTradersV1Options,
  });

  server.route({
    method: "POST",
    path: "/collections-sets/v1",
    options: collectionsEndpoints.postCreateCollectionsSetV1Options,
  });

  server.route({
    method: "PUT",
    path: "/collections/{collection}/community/v1",
    options: collectionsEndpoints.putSetCollectionCommunityV1Options,
  });

  server.route({
    method: "POST",
    path: "/collections/disable-metadata/v1",
    options: collectionsEndpoints.postSetCollectionDisableMetadataV1Options,
  });

  server.route({
    method: "GET",
    path: "/collections/{collection}/supported-marketplaces/v1",
    options: collectionsEndpoints.getCollectionSupportedMarketplacesV1Options,
  });

  server.route({
    method: "GET",
    path: "/collections/{collection}/marketplace-configurations/v1",
    options: collectionsEndpoints.getCollectionMarketplaceConfigurationsV1Options,
  });

  server.route({
    method: "POST",
    path: "/collections/spam-status/v1",
    options: collectionsEndpoints.postSpamStatusCollectionV1Options,
  });

  server.route({
    method: "GET",
    path: "/collections/search/v1",
    options: collectionsEndpoints.getCollectionSearchV1Options,
  });

  // Chain

  server.route({
    method: "GET",
    path: "/chain/stats/v1",
    options: chainEndpoints.getChainStats,
  });

  // Collections Sets

  server.route({
    method: "GET",
    path: "/collections-sets/{collectionsSetId}/owners-distribution/v1",
    options: collectionsSetsEndpoints.getCollectionsSetOwnersDistributionV1Options,
  });

  // Contracts Sets

  server.route({
    method: "POST",
    path: "/contracts-sets/v1",
    options: contractsSetsEndpoints.postCreateContractsSetV1Options,
  });

  // Events

  server.route({
    method: "GET",
    path: "/events/collections/floor-ask/v1",
    options: eventsEndpoints.getCollectionsFloorAskV1Options,
  });

  server.route({
    method: "GET",
    path: "/events/collections/floor-ask/v2",
    options: eventsEndpoints.getCollectionsFloorAskV2Options,
  });

  server.route({
    method: "GET",
    path: "/events/orders/v1",
    options: eventsEndpoints.getOrderEventsV1Options,
  });

  server.route({
    method: "GET",
    path: "/events/asks/v2",
    options: eventsEndpoints.getAsksEventsV2Options,
  });

  server.route({
    method: "GET",
    path: "/events/asks/v3",
    options: eventsEndpoints.getAsksEventsV3Options,
  });

  server.route({
    method: "GET",
    path: "/events/tokens/floor-ask/v2",
    options: eventsEndpoints.getTokensFloorAskV2Options,
  });

  server.route({
    method: "GET",
    path: "/events/tokens/floor-ask/v3",
    options: eventsEndpoints.getTokensFloorAskV3Options,
  });

  server.route({
    method: "GET",
    path: "/events/tokens/floor-ask/v4",
    options: eventsEndpoints.getTokensFloorAskV4Options,
  });

  server.route({
    method: "GET",
    path: "/events/bids/v1",
    options: eventsEndpoints.getBidEventsV1Options,
  });

  server.route({
    method: "GET",
    path: "/events/bids/v2",
    options: eventsEndpoints.getBidEventsV2Options,
  });

  server.route({
    method: "GET",
    path: "/events/bids/v3",
    options: eventsEndpoints.getBidEventsV3Options,
  });

  server.route({
    method: "GET",
    path: "/events/collections/top-bid/v1",
    options: eventsEndpoints.getCollectionsTopBidV1Options,
  });

  server.route({
    method: "GET",
    path: "/events/collections/top-bid/v2",
    options: eventsEndpoints.getCollectionsTopBidV2Options,
  });

  // Execute

  server.route({
    method: "POST",
    path: "/execute/bid/v4",
    options: executeEndpoints.getExecuteBidV4Options,
  });

  server.route({
    method: "POST",
    path: "/execute/bid/v5",
    options: executeEndpoints.getExecuteBidV5Options,
  });

  server.route({
    method: "POST",
    path: "/execute/buy/v5",
    options: executeEndpoints.getExecuteBuyV5Options,
  });

  server.route({
    method: "POST",
    path: "/execute/buy/v6",
    options: executeEndpoints.getExecuteBuyV6Options,
  });

  server.route({
    method: "POST",
    path: "/execute/buy/v7",
    options: executeEndpoints.getExecuteBuyV7Options,
  });

  server.route({
    method: "GET",
    path: "/execute/cancel/v2",
    options: executeEndpoints.getExecuteCancelV2Options,
  });

  server.route({
    method: "POST",
    path: "/execute/cancel/v3",
    options: executeEndpoints.getExecuteCancelV3Options,
  });

  server.route({
    method: "POST",
    path: "/execute/list/v4",
    options: executeEndpoints.getExecuteListV4Options,
  });

  server.route({
    method: "POST",
    path: "/execute/list/v5",
    options: executeEndpoints.getExecuteListV5Options,
  });

  server.route({
    method: "POST",
    path: "/execute/sell/v6",
    options: executeEndpoints.getExecuteSellV6Options,
  });

  server.route({
    method: "POST",
    path: "/execute/sell/v7",
    options: executeEndpoints.getExecuteSellV7Options,
  });

  server.route({
    method: "POST",
    path: "/execute/auth-signature/v1",
    options: executeEndpoints.postAuthSignatureV1Options,
  });

  server.route({
    method: "POST",
    path: "/execute/cancel-signature/v1",
    options: executeEndpoints.postCancelSignatureV1Options,
  });

  server.route({
    method: "POST",
    path: "/execute/call/v1",
    options: executeEndpoints.postExecuteCallV1Options,
  });

  server.route({
    method: "POST",
    path: "/execute/deposit/v1",
    options: executeEndpoints.postExecuteDepositV1Options,
  });

  server.route({
    method: "POST",
    path: "/execute/mint/v1",
    options: executeEndpoints.postExecuteMintV1Options,
  });

  server.route({
    method: "POST",
    path: "/execute/results/v1",
    options: executeEndpoints.postExecuteResultsV1,
  });

  server.route({
    method: "POST",
    path: "/execute/solve/v1",
    options: executeEndpoints.postExecuteSolveV1Options,
  });

  server.route({
    method: "POST",
    path: "/execute/solve/capacity/v1",
    options: executeEndpoints.postExecuteSolveCapacityV1Options,
  });

  server.route({
    method: "POST",
    path: "/execute/status/v1",
    options: executeEndpoints.postExecuteStatusV1Options,
  });

  server.route({
    method: "POST",
    path: "/execute/transfer/v1",
    options: executeEndpoints.postExecuteTransferV1Options,
  });

  server.route({
    method: "POST",
    path: "/execute/permit-signature/v1",
    options: executeEndpoints.postPermitSignatureV1Options,
  });

  server.route({
    method: "POST",
    path: "/execute/pre-signature/v1",
    options: executeEndpoints.postPreSignatureV1Options,
  });

  // Health

  // Both `/readyz` and `/livez` point to the same handler,
  // but maybe at some point we want to separate the logic:
  // `/readyz`: Check whether the container can be added to the load balancer and have it receive traffic
  // `/livez`: During the lifetime of the container do checks to see if the container is still responsive

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

  // Management

  server.route({
    method: "POST",
    path: "/management/mints/simulate/v1",
    options: managementEndpoints.postSimulateMintV1Options,
  });

  server.route({
    method: "POST",
    path: "/management/orders/simulate/v1",
    options: managementEndpoints.postSimulateOrderV1Options,
  });

  server.route({
    method: "POST",
    path: "/management/cosigners/v1",
    options: managementEndpoints.postCosignersV1Options,
  });

  // Oracle

  server.route({
    method: "GET",
    path: "/oracle/collections/floor-ask/v4",
    options: oracleEndpoints.getCollectionFloorAskOracleV4Options,
  });

  server.route({
    method: "GET",
    path: "/oracle/collections/floor-ask/v5",
    options: oracleEndpoints.getCollectionFloorAskOracleV5Options,
  });

  server.route({
    method: "GET",
    path: "/oracle/collections/floor-ask/v6",
    options: oracleEndpoints.getCollectionFloorAskOracleV6Options,
  });

  server.route({
    method: "GET",
    path: "/oracle/collections/top-bid/v2",
    options: oracleEndpoints.getCollectionTopBidOracleV2Options,
  });

  server.route({
    method: "GET",
    path: "/oracle/collections/top-bid/v3",
    options: oracleEndpoints.getCollectionTopBidOracleV3Options,
  });

  server.route({
    method: "GET",
    path: "/oracle/tokens/status/v2",
    options: oracleEndpoints.getTokenStatusOracleV2Options,
  });

  server.route({
    method: "GET",
    path: "/oracle/tokens/status/v3",
    options: oracleEndpoints.getTokenStatusOracleV3Options,
  });

  server.route({
    method: "GET",
    path: "/oracle/collections/bid-ask-midpoint/v1",
    options: oracleEndpoints.getCollectionBidAskMidpointOracleV1Options,
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
    path: "/orders/all/v2",
    options: ordersEndpoints.getOrdersAllV2Options,
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
    path: "/orders/asks/v3",
    options: ordersEndpoints.getOrdersAsksV3Options,
  });

  server.route({
    method: "GET",
    path: "/orders/asks/v4",
    options: ordersEndpoints.getOrdersAsksV4Options,
  });

  server.route({
    method: "GET",
    path: "/orders/asks/v5",
    options: ordersEndpoints.getOrdersAsksV5Options,
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
    path: "/orders/bids/v3",
    options: ordersEndpoints.getOrdersBidsV3Options,
  });

  server.route({
    method: "GET",
    path: "/orders/bids/v4",
    options: ordersEndpoints.getOrdersBidsV4Options,
  });

  server.route({
    method: "GET",
    path: "/orders/bids/v5",
    options: ordersEndpoints.getOrdersBidsV5Options,
  });

  server.route({
    method: "GET",
    path: "/orders/bids/v6",
    options: ordersEndpoints.getOrdersBidsV6Options,
  });

  server.route({
    method: "GET",
    path: "/orders/depth/v1",
    options: ordersEndpoints.getOrdersDepthV1Options,
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
    method: "GET",
    path: "/liquidity/users/v2",
    options: ordersEndpoints.getUsersLiquidityV2Options,
  });

  server.route({
    method: "GET",
    path: "/orders/users/{user}/top-bids/v1",
    options: ordersEndpoints.getUserTopBidsV1Options,
  });

  server.route({
    method: "GET",
    path: "/orders/users/{user}/top-bids/v2",
    options: ordersEndpoints.getUserTopBidsV2Options,
  });

  server.route({
    method: "GET",
    path: "/orders/users/{user}/top-bids/v3",
    options: ordersEndpoints.getUserTopBidsV3Options,
  });

  server.route({
    method: "GET",
    path: "/orders/users/{user}/top-bids/v4",
    options: ordersEndpoints.getUserTopBidsV4Options,
  });

  server.route({
    method: "POST",
    path: "/order/v2",
    options: ordersEndpoints.postOrderV2Options,
  });

  server.route({
    method: "POST",
    path: "/order/v3",
    options: ordersEndpoints.postOrderV3Options,
  });

  server.route({
    method: "POST",
    path: "/order/v4",
    options: ordersEndpoints.postOrderV4Options,
  });

  server.route({
    method: "POST",
    path: "/orders/v1",
    options: ordersEndpoints.postOrdersV1Options,
  });

  server.route({
    method: "POST",
    path: "/seaport/offers",
    options: ordersEndpoints.postSeaportOffersV1Options,
  });

  server.route({
    method: "GET",
    path: "/cross-posting-orders/v1",
    options: ordersEndpoints.getCrossPostingOrdersV1Options,
  });

  server.route({
    method: "POST",
    path: "/orders/invalidate/v1",
    options: ordersEndpoints.postInvalidateOrdersOptions,
  });

  // Owners

  server.route({
    method: "GET",
    path: "/owners/v1",
    options: ownersEndpoints.getOwnersV1Options,
  });

  server.route({
    method: "GET",
    path: "/owners/v2",
    options: ownersEndpoints.getOwnersV2Options,
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

  server.route({
    method: "GET",
    path: "/redirect/currency/{address}/icon/v1",
    options: redirectsEndpoints.getRedirectCurrencyIconV1Options,
  });

  // Search

  server.route({
    method: "GET",
    path: "/search/collections/v1",
    options: searchEndpoints.getSearchCollectionsV1Options,
  });

  server.route({
    method: "GET",
    path: "/search/collections/v2",
    options: searchEndpoints.getSearchCollectionsV2Options,
  });

  server.route({
    method: "GET",
    path: "/search/activities/v1",
    options: searchEndpoints.getSearchActivitiesV1Options,
  });

  // Stats

  server.route({
    method: "GET",
    path: "/stats/v1",
    options: statsEndpoints.getStatsV1Options,
  });

  server.route({
    method: "GET",
    path: "/stats/v2",
    options: statsEndpoints.getStatsV2Options,
  });

  // Assets

  server.route({
    method: "GET",
    path: "/assets/v1",
    options: assetsEndpoints.getAssetV1Options,
  });

  // Tokens

  server.route({
    method: "POST",
    path: "/tokens/spam-status/v1",
    options: tokensEndpoints.postSpamStatusTokenV1Options,
  });

  server.route({
    method: "GET",
    path: "/tokens/flag/changes/v1",
    options: tokensEndpoints.getFlaggedTokensChangesV1Options,
  });

  server.route({
    method: "POST",
    path: "/tokens/flag/v1",
    options: tokensEndpoints.postFlagTokenV1Options,
  });

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
    path: "/tokens/v5",
    options: tokensEndpoints.getTokensV5Options,
  });

  server.route({
    method: "GET",
    path: "/tokens/v6",
    options: tokensEndpoints.getTokensV6Options,
  });

  server.route({
    method: "GET",
    path: "/tokens/v7",
    options: tokensEndpoints.getTokensV7Options,
  });

  server.route({
    method: "GET",
    path: "/tokens/v8",
    options: tokensEndpoints.getTokensV8Options,
  });

  server.route({
    method: "GET",
    path: "/tokens/bootstrap/v1",
    options: tokensEndpoints.getTokensBootstrapV1Options,
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
    method: "GET",
    path: "/users/{user}/tokens/v3",
    options: tokensEndpoints.getUserTokensV3Options,
  });

  server.route({
    method: "GET",
    path: "/users/{user}/tokens/v4",
    options: tokensEndpoints.getUserTokensV4Options,
  });

  server.route({
    method: "GET",
    path: "/users/{user}/tokens/v5",
    options: tokensEndpoints.getUserTokensV5Options,
  });

  server.route({
    method: "GET",
    path: "/users/{user}/tokens/v6",
    options: tokensEndpoints.getUserTokensV6Options,
  });

  server.route({
    method: "GET",
    path: "/users/{user}/tokens/v7",
    options: tokensEndpoints.getUserTokensV7Options,
  });

  server.route({
    method: "GET",
    path: "/users/{user}/tokens/v8",
    options: tokensEndpoints.getUserTokensV8Options,
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

  server.route({
    method: "POST",
    path: "/tokens/simulate-top-bid/v1",
    options: tokensEndpoints.postSimulateTopBidV1Options,
  });

  server.route({
    method: "GET",
    path: "/tokens/ids/v1",
    options: tokensEndpoints.getTokensIdsV1Options,
  });

  server.route({
    method: "POST",
    path: "/tokens/disable-metadata/v1",
    options: tokensEndpoints.postSetTokenDisableMetadataV1Options,
  });

  // Token sets

  server.route({
    method: "POST",
    path: "/token-sets/v1",
    options: tokensEndpoints.postTokenSetsV1Options,
  });

  server.route({
    method: "POST",
    path: "/token-sets/v2",
    options: tokensEndpoints.postTokenSetsV2Options,
  });

  // Transactions

  server.route({
    method: "GET",
    path: "/transactions/{txHash}/synced/v1",
    options: transactionsEndpoints.getTransactionSyncedV1Options,
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
    path: "/sales/v4",
    options: transfersEndpoints.getSalesV4Options,
  });

  server.route({
    method: "GET",
    path: "/sales/v5",
    options: transfersEndpoints.getSalesV5Options,
  });

  server.route({
    method: "GET",
    path: "/sales/v6",
    options: transfersEndpoints.getSalesV6Options,
  });

  server.route({
    method: "GET",
    path: "/sales/bulk/v1",
    options: transfersEndpoints.getSalesBulkV1Options,
  });

  server.route({
    method: "GET",
    path: "/transfers/v2",
    options: transfersEndpoints.getTransfersV2Options,
  });

  server.route({
    method: "GET",
    path: "/transfers/v3",
    options: transfersEndpoints.getTransfersV3Options,
  });

  server.route({
    method: "GET",
    path: "/transfers/v4",
    options: transfersEndpoints.getTransfersV4Options,
  });

  server.route({
    method: "GET",
    path: "/transfers/bulk/v1",
    options: transfersEndpoints.getTransfersBulkV1Options,
  });

  server.route({
    method: "GET",
    path: "/transfers/bulk/v2",
    options: transfersEndpoints.getTransfersBulkV2Options,
  });

  // sync

  server.route({
    method: "GET",
    path: "/sync/asks/v1",
    options: syncEndpoints.getSyncOrdersAsksV1Options,
  });

  // sources

  server.route({
    method: "GET",
    path: "/sources/v1",
    options: sourcesEndpoints.getSourcesV1Options,
  });

  // currencies

  server.route({
    method: "GET",
    path: "/currencies/conversion/v1",
    options: currenciesEndpoints.getCurrencyConversionV1Options,
  });

  // Debug APIs
  if (config.enableDebug) {
    server.route({
      method: "GET",
      path: "/debug/event-parsing",
      options: debugEndpoints.eventParsingOptions,
    });

    server.route({
      method: "POST",
      path: "/debug/order-saving",
      options: debugEndpoints.orderSavingOptions,
    });

    server.route({
      method: "GET",
      path: "/debug/get-order",
      options: debugEndpoints.getOrderOptions,
    });

    server.route({
      method: "GET",
      path: "/debug/reset",
      options: debugEndpoints.resetOptions,
    });

    server.route({
      method: "GET",
      path: "/debug/parse-royalties",
      options: debugEndpoints.parseRoyaltiesOptions,
    });
  }
};
