import { RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { config } from "@/config/index";
import { getNetworkSettings } from "@/config/network";

type Marketplace = {
  name: string;
  imageUrl: string;
  feeBps: number;
  fee: {
    bps: number;
    percent: number;
  };
  orderbook: string | null;
  orderKind: string | null;
  listingEnabled: boolean;
};

export const getMarketplaces: RouteOptions = {
  description: "Get supported marketplaces",
  tags: ["api", "x-admin"],
  timeout: {
    server: 10 * 1000,
  },
  plugins: {
    "hapi-swagger": {
      order: 7,
    },
  },
  response: {
    schema: Joi.object({
      marketplaces: Joi.array().items(
        Joi.object({
          name: Joi.string(),
          imageUrl: Joi.string(),
          fee: Joi.object({
            bps: Joi.number(),
            percent: Joi.number(),
          }),
          feeBps: Joi.number(),
          orderbook: Joi.string().allow(null),
          orderKind: Joi.string().allow(null),
          listingEnabled: Joi.boolean(),
        })
      ),
    }).label(`getMarketplacesv1Resp`),
  },
  handler: async () => {
    const marketplaces: Marketplace[] = [
      {
        name: "Reservoir",
        imageUrl: `https://${
          getNetworkSettings().subDomain
        }.reservoir.tools/redirect/sources/reservoir/logo/v2`,
        fee: {
          percent: 0,
          bps: 0,
        },
        feeBps: 0,
        orderbook: "reservoir",
        orderKind: "seaport",
        listingEnabled: true,
      },
      {
        name: "OpenSea",
        imageUrl: `https://${
          getNetworkSettings().subDomain
        }.reservoir.tools/redirect/sources/opensea/logo/v2`,
        fee: {
          percent: 2.5,
          bps: 250,
        },
        feeBps: 0.025,
        orderbook: "opensea",
        orderKind: "seaport",
        listingEnabled: false,
      },
      {
        name: "LooksRare",
        imageUrl: `https://${
          getNetworkSettings().subDomain
        }.reservoir.tools/redirect/sources/looksrare/logo/v2`,
        fee: {
          percent: 2,
          bps: 200,
        },
        feeBps: 0.02,
        orderbook: "looks-rare",
        orderKind: "looks-rare",
        listingEnabled: false,
      },
      {
        name: "X2Y2",
        imageUrl: `https://${
          getNetworkSettings().subDomain
        }.reservoir.tools/redirect/sources/x2y2/logo/v2`,
        fee: {
          percent: 0.5,
          bps: 50,
        },
        feeBps: 0.005,
        orderbook: "x2y2",
        orderKind: "x2y2",
        listingEnabled: false,
      },
      {
        name: "Foundation",
        imageUrl: `https://${
          getNetworkSettings().subDomain
        }.reservoir.tools/redirect/sources/foundation/logo/v2`,
        fee: {
          percent: 5,
          bps: 500,
        },
        feeBps: 0.05,
        orderbook: null,
        orderKind: null,
        listingEnabled: false,
      },
    ];

    marketplaces.forEach((marketplace) => {
      let listableOrderbooks = ["reservoir"];
      switch (config.chainId) {
        case 1: {
          listableOrderbooks = ["reservoir", "opensea", "looks-rare", "x2y2"];
          break;
        }
        case 4: {
          listableOrderbooks = ["reservoir", "opensea", "looks-rare"];
          break;
        }
        case 5: {
          listableOrderbooks = ["reservoir", "opensea", "looks-rare"];
          break;
        }
        case 137: {
          listableOrderbooks = ["reservoir", "opensea"];
          break;
        }
      }
      marketplace.listingEnabled =
        marketplace.orderbook && listableOrderbooks.includes(marketplace.orderbook) ? true : false;
    });

    return {
      marketplaces: marketplaces,
    };
  },
};
