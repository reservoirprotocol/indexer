import { RouteOptions } from "@hapi/hapi";
import Joi from "joi";
import { config } from "@/config/index";

type Marketplace = {
  name: string;
  imageUrl: string;
  feeBps: number;
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
        imageUrl: "https://api.reservoir.tools/redirect/sources/reservoir/logo/v2",
        feeBps: 0,
        orderbook: "reservoir",
        orderKind: "seaport",
        listingEnabled: true,
      },
      {
        name: "OpenSea",
        imageUrl: "https://api.reservoir.tools/redirect/sources/opensea/logo/v2",
        feeBps: 0.025,
        orderbook: "opensea",
        orderKind: "seaport",
        listingEnabled: false,
      },
      {
        name: "LooksRare",
        imageUrl: "https://api.reservoir.tools/redirect/sources/looksrare/logo/v2",
        feeBps: 0.02,
        orderbook: "looks-rare",
        orderKind: "looks-rare",
        listingEnabled: false,
      },
      {
        name: "X2Y2",
        imageUrl: "https://api.reservoir.tools/redirect/sources/x2y2/logo/v2",
        feeBps: 0.005,
        orderbook: "x2y2",
        orderKind: "x2y2",
        listingEnabled: false,
      },
      {
        name: "Foundation",
        imageUrl: "https://api.reservoir.tools/redirect/sources/foundation/logo/v2",
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
      }
      marketplace.listingEnabled =
        marketplace.orderbook && listableOrderbooks.includes(marketplace.orderbook) ? true : false;
    });

    return {
      marketplaces: marketplaces,
    };
  },
};
