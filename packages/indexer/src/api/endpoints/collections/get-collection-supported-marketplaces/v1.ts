/* eslint-disable @typescript-eslint/no-explicit-any */

import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import * as Sdk from "@reservoir0x/sdk";
import Joi from "joi";

import { redb } from "@/common/db";
import { logger } from "@/common/logger";
import { fromBuffer } from "@/common/utils";
import { config } from "@/config/index";
import { getNetworkSettings, getSubDomain } from "@/config/network";
import { OrderKind } from "@/orderbook/orders";
import { getOrUpdateBlurRoyalties } from "@/utils/blur";
import { checkMarketplaceIsFiltered } from "@/utils/erc721c";
import * as marketplaceFees from "@/utils/marketplace-fees";
import * as registry from "@/utils/royalties/registry";

type PaymentToken = {
  address: string;
  decimals: number;
  name: string;
  symbol: string;
};

type Marketplace = {
  name: string;
  domain?: string;
  imageUrl: string;
  fee: {
    bps: number;
  };
  royalties?: {
    minBps: number;
    maxBps: number;
  };
  orderbook: string | null;
  orderKind: OrderKind | null;
  listingEnabled: boolean;
  customFeesSupported: boolean;
  collectionBidSupported?: boolean;
  traitBidSupported: boolean;
  partialBidSupported: boolean;
  minimumBidExpiry?: number;
  minimumPrecision?: string;
  supportedBidCurrencies: string[];
  paymentTokens?: PaymentToken[];
};

const version = "v1";

export const getCollectionSupportedMarketplacesV1Options: RouteOptions = {
  cache: {
    privacy: "public",
    expiresIn: 60000,
  },
  description: "Supported marketplaces by collection",
  notes:
    "The ReservoirKit `ListModal` client utilizes this API to identify the marketplace(s) it can list on.",
  tags: ["api", "x-deprecated"],
  plugins: {
    "hapi-swagger": {
      order: 5,
    },
  },
  validate: {
    params: Joi.object({
      collection: Joi.string()
        .lowercase()
        .required()
        .description(
          "Filter to a particular collection, e.g. `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63`"
        ),
    }),
    query: Joi.object({
      tokenId: Joi.string()
        .optional()
        .description("When set, token-level royalties will be returned in the response"),
    }),
  },
  response: {
    schema: Joi.object({
      marketplaces: Joi.array().items(
        Joi.object({
          name: Joi.string(),
          domain: Joi.string().optional(),
          imageUrl: Joi.string(),
          fee: Joi.object({
            bps: Joi.number(),
          }).description("Marketplace Fee"),
          royalties: Joi.object({
            minBps: Joi.number(),
            maxBps: Joi.number(),
          }),
          orderbook: Joi.string().allow(null),
          orderKind: Joi.string().allow(null),
          listingEnabled: Joi.boolean(),
          customFeesSupported: Joi.boolean(),
          minimumBidExpiry: Joi.number(),
          minimumPrecision: Joi.string(),
          collectionBidSupported: Joi.boolean(),
          traitBidSupported: Joi.boolean(),
          partialBidSupported: Joi.boolean().description(
            "This indicates whether or not multi quantity bidding is supported"
          ),
          supportedBidCurrencies: Joi.array()
            .items(Joi.string())
            .description("erc20 contract addresses"),
          paymentTokens: Joi.array()
            .items(
              Joi.object({
                address: Joi.string(),
                decimals: Joi.number(),
                name: Joi.string().allow(null),
                symbol: Joi.string(),
              })
            )
            .allow(null),
        })
      ),
    }),
  },
  handler: async (request: Request) => {
    const params = request.params as any;

    try {
      const collectionResult = await redb.oneOrNone(
        `
          SELECT
            collections.royalties,
            collections.new_royalties,
            collections.marketplace_fees,
            collections.payment_tokens,
            collections.contract,
            collections.token_count,
            (
              SELECT
                kind
              FROM contracts
              WHERE contracts.address = collections.contract
            ) AS contract_kind
          FROM collections
          JOIN contracts
            ON collections.contract = contracts.address
          WHERE collections.id = $/collection/
          LIMIT 1
        `,
        { collection: params.collection }
      );

      if (!collectionResult) {
        throw Boom.badRequest(`Collection ${params.collection} not found`);
      }

      let defaultRoyalties = (collectionResult.royalties ?? []) as Royalty[];
      if (params.tokenId) {
        defaultRoyalties = await registry.getRegistryRoyalties(
          fromBuffer(collectionResult.contract),
          params.tokenId
        );
      }

      const ns = getNetworkSettings();

      const marketplaces: Marketplace[] = [];

      if (Sdk.LooksRareV2.Addresses.Exchange[config.chainId]) {
        marketplaces.push({
          name: "LooksRare",
          domain: "looksrare.org",
          imageUrl: `https://${getSubDomain()}.reservoir.tools/redirect/sources/looksrare/logo/v2`,
          fee: {
            bps: 50,
          },
          orderbook: "looks-rare",
          orderKind: "looks-rare-v2",
          listingEnabled: false,
          minimumBidExpiry: 15 * 60,
          customFeesSupported: false,
          supportedBidCurrencies: [Sdk.Common.Addresses.WNative[config.chainId]],
          partialBidSupported: false,
          traitBidSupported: false,
        });
      }

      if (Sdk.X2Y2.Addresses.Exchange[config.chainId]) {
        marketplaces.push({
          name: "X2Y2",
          domain: "x2y2.io",
          imageUrl: `https://${getSubDomain()}.reservoir.tools/redirect/sources/x2y2/logo/v2`,
          fee: {
            bps: 50,
          },
          orderbook: "x2y2",
          orderKind: "x2y2",
          listingEnabled: false,
          customFeesSupported: false,
          supportedBidCurrencies: [Sdk.Common.Addresses.WNative[config.chainId]],
          partialBidSupported: false,
          traitBidSupported: false,
        });
      }

      type Royalty = { bps: number; recipient: string };

      // Handle Reservoir
      {
        const royalties = defaultRoyalties;
        marketplaces.push({
          name: "Reservoir",
          imageUrl: `https://${getSubDomain()}.reservoir.tools/redirect/sources/reservoir/logo/v2`,
          fee: {
            bps: 0,
          },
          royalties: {
            minBps: 0,
            maxBps: royalties.map((r) => r.bps).reduce((a, b) => a + b, 0),
          },
          orderbook: "reservoir",
          orderKind: config.chainId === 11155111 ? "payment-processor-v2" : "seaport-v1.5",
          listingEnabled: true,
          customFeesSupported: true,
          collectionBidSupported: Number(collectionResult.token_count) <= config.maxTokenSetSize,
          supportedBidCurrencies: Object.keys(ns.supportedBidCurrencies),
          partialBidSupported: true,
          traitBidSupported: true,
        });
      }

      // Handle OpenSea
      {
        let openseaMarketplaceFees: Royalty[] = collectionResult.marketplace_fees?.opensea;
        if (collectionResult.marketplace_fees?.opensea == null) {
          openseaMarketplaceFees = await marketplaceFees.getCollectionOpenseaFees(
            params.collection,
            collectionResult.contract
          );
        }

        const openseaRoyalties: Royalty[] = collectionResult.new_royalties?.opensea;

        let maxOpenseaRoyaltiesBps: number | undefined;
        if (openseaRoyalties) {
          maxOpenseaRoyaltiesBps = openseaRoyalties
            .map(({ bps }) => bps)
            .reduce((a, b) => a + b, 0);
        }

        marketplaces.push({
          name: "OpenSea",
          domain: "opensea.io",
          imageUrl: `https://${getSubDomain()}.reservoir.tools/redirect/sources/opensea/logo/v2`,
          fee: {
            bps: openseaMarketplaceFees[0]?.bps ?? 0,
          },
          royalties: maxOpenseaRoyaltiesBps
            ? {
                minBps: Math.min(maxOpenseaRoyaltiesBps, 50),
                maxBps: maxOpenseaRoyaltiesBps,
              }
            : undefined,
          orderbook: "opensea",
          orderKind: "seaport-v1.5",
          listingEnabled: false,
          customFeesSupported: false,
          minimumBidExpiry: 15 * 60,
          supportedBidCurrencies: Object.keys(ns.supportedBidCurrencies),
          paymentTokens: collectionResult.payment_tokens?.opensea,
          partialBidSupported: true,
          traitBidSupported: true,
        });
      }

      // Handle Blur
      if (Sdk.Blur.Addresses.Beth[config.chainId]) {
        const royalties = await getOrUpdateBlurRoyalties(params.collection);
        if (royalties) {
          marketplaces.push({
            name: "Blur",
            domain: "blur.io",
            imageUrl: `https://${getSubDomain()}.reservoir.tools/redirect/sources/blur.io/logo/v2`,
            fee: {
              bps: 0,
            },
            royalties: royalties
              ? {
                  minBps: royalties.minimumRoyaltyBps,
                  // If the maximum royalty is not available for Blur, use the OpenSea one
                  maxBps:
                    royalties.maximumRoyaltyBps ??
                    marketplaces[marketplaces.length - 1].royalties?.maxBps,
                }
              : undefined,
            orderbook: "blur",
            orderKind: "blur",
            listingEnabled: false,
            customFeesSupported: false,
            minimumPrecision: "0.01",
            minimumBidExpiry: 10 * 24 * 60 * 60,
            supportedBidCurrencies: [Sdk.Blur.Addresses.Beth[config.chainId]],
            partialBidSupported: true,
            traitBidSupported: false,
          });
        }
      }

      for await (const marketplace of marketplaces) {
        let supportedOrderbooks = ["reservoir"];
        switch (config.chainId) {
          case 1: {
            supportedOrderbooks = ["reservoir", "opensea", "looks-rare", "x2y2", "blur"];
            break;
          }
          case 4: {
            supportedOrderbooks = ["reservoir", "opensea", "looks-rare"];
            break;
          }
          case 5: {
            supportedOrderbooks = ["reservoir", "opensea", "looks-rare", "x2y2"];
            break;
          }
          case 10:
          case 56:
          case 8453:
          case 42161:
          case 42170:
          case 7777777:
          case 11155111:
          case 80001:
          case 84531:
          case 999:
          case 137: {
            supportedOrderbooks = ["reservoir", "opensea"];
            break;
          }
        }

        marketplace.listingEnabled = !!(
          marketplace.orderbook && supportedOrderbooks.includes(marketplace.orderbook)
        );

        // Check if the exchange is filtered
        if (marketplace.listingEnabled) {
          let operators: string[] = [];

          const seaportOperators = [Sdk.SeaportV15.Addresses.Exchange[config.chainId]];
          if (Sdk.SeaportBase.Addresses.OpenseaConduitKey[config.chainId]) {
            seaportOperators.push(
              new Sdk.SeaportBase.ConduitController(config.chainId).deriveConduit(
                Sdk.SeaportBase.Addresses.OpenseaConduitKey[config.chainId]
              )
            );
          }

          switch (marketplace.orderKind) {
            case "blur": {
              operators = [
                Sdk.BlurV2.Addresses.Exchange[config.chainId],
                Sdk.BlurV2.Addresses.Delegate[config.chainId],
              ];
              break;
            }

            case "seaport-v1.5": {
              operators = seaportOperators;
              break;
            }

            case "x2y2": {
              operators = [
                Sdk.X2Y2.Addresses.Exchange[config.chainId],
                collectionResult.contract_kind === "erc1155"
                  ? Sdk.X2Y2.Addresses.Erc1155Delegate[config.chainId]
                  : Sdk.X2Y2.Addresses.Erc721Delegate[config.chainId],
              ];
              break;
            }

            case "looks-rare-v2": {
              operators = [
                Sdk.LooksRareV2.Addresses.Exchange[config.chainId],
                Sdk.LooksRareV2.Addresses.TransferManager[config.chainId],
              ];
              break;
            }
          }

          const blocked = await checkMarketplaceIsFiltered(params.collection, operators);
          if (blocked && marketplace.orderbook === "reservoir") {
            marketplace.orderKind = "payment-processor";
            marketplace.partialBidSupported = false;
            marketplace.traitBidSupported = false;

            if (
              config.chainId === 137 &&
              params.collection === "0xa87dbcfa18adb7c00593e2c2469d83213c87aecd"
            ) {
              marketplace.supportedBidCurrencies = ["0x456f931298065b1852647de005dd27227146d8b9"];
            }
          } else if (blocked && marketplace.orderbook === "looks-rare") {
            const seaportBlocked = await checkMarketplaceIsFiltered(
              params.collection,
              seaportOperators
            );

            if (!seaportBlocked) {
              marketplace.orderKind = "seaport-v1.5";
            } else {
              marketplace.listingEnabled = false;
            }
          } else if (blocked) {
            marketplace.listingEnabled = false;
          }
        }
      }

      return { marketplaces };
    } catch (error) {
      logger.error(
        `get-collection-supported-marketplaces-${version}-handler`,
        `Handler failure: ${error}`
      );
      throw error;
    }
  },
};
