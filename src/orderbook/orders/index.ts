// Exports

export * as foundation from "@/orderbook/orders/foundation";
export * as looksRare from "@/orderbook/orders/looks-rare";
export * as openDao from "@/orderbook/orders/opendao";
export * as seaport from "@/orderbook/orders/seaport";
export * as x2y2 from "@/orderbook/orders/x2y2";
export * as zeroExV4 from "@/orderbook/orders/zeroex-v4";

// Imports

import * as Sdk from "@reservoir0x/sdk";
import { BidDetails, ListingDetails } from "@reservoir0x/sdk/dist/router/types";

import { redb } from "@/common/db";
import { config } from "@/config/index";
import { Sources } from "@/models/sources";
import { SourcesEntity } from "@/models/sources/sources-entity";

// Whenever a new order kind is added, make sure to also include an
// entry/implementation in the below types/methods in order to have
// the new order available/fillable.

export type OrderKind =
  | "wyvern-v2"
  | "wyvern-v2.3"
  | "looks-rare"
  | "zeroex-v4-erc721"
  | "zeroex-v4-erc1155"
  | "opendao-erc721"
  | "opendao-erc1155"
  | "foundation"
  | "x2y2"
  | "seaport"
  | "rarible"
  | "element-erc721"
  | "element-erc1155"
  | "quixotic"
  | "nouns"
  | "zora-v3"
  | "mint"
  | "cryptopunks";

// In case we don't have the source of an order readily available, we use
// a default value where possible (since very often the exchange protocol
// is tightly coupled to a source marketplace and we just assume that the
// bulk of orders from a protocol come from known that marketplace).
export const getOrderSourceByOrderKind = async (
  orderKind: OrderKind
): Promise<SourcesEntity | null> => {
  try {
    const sources = await Sources.getInstance();
    switch (orderKind) {
      case "x2y2":
        return sources.getOrInsert("x2y2.io");
      case "foundation":
        return sources.getOrInsert("foundation.app");
      case "looks-rare":
        return sources.getOrInsert("looksrare.org");
      case "seaport":
      case "wyvern-v2":
      case "wyvern-v2.3":
        return sources.getOrInsert("opensea.io");
      case "rarible":
        return sources.getOrInsert("rarible.com");
      case "element-erc721":
      case "element-erc1155":
        return sources.getOrInsert("element.market");
      case "quixotic":
        return sources.getOrInsert("quixotic.io");
      case "zora-v3":
        return sources.getOrInsert("zora.co");
      case "nouns":
        return sources.getOrInsert("nouns.wtf");
      default:
        // For all other order kinds we cannot default the source
        return null;
    }
  } catch {
    // Return the null source in case of any errors
    return null;
  }
};

// Support for filling listings
export const generateListingDetails = (
  order: {
    kind: OrderKind;
    currency: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rawData: any;
  },
  token: {
    kind: "erc721" | "erc1155";
    contract: string;
    tokenId: string;
    amount?: number;
  }
): ListingDetails => {
  const common = {
    contractKind: token.kind,
    contract: token.contract,
    tokenId: token.tokenId,
    currency: order.currency,
    amount: token.amount ?? 1,
  };

  switch (order.kind) {
    case "foundation": {
      return {
        kind: "foundation",
        ...common,
        order: new Sdk.Foundation.Order(config.chainId, order.rawData),
      };
    }

    case "looks-rare": {
      return {
        kind: "looks-rare",
        ...common,
        order: new Sdk.LooksRare.Order(config.chainId, order.rawData),
      };
    }

    case "opendao-erc721":
    case "opendao-erc1155": {
      return {
        kind: "opendao",
        ...common,
        order: new Sdk.OpenDao.Order(config.chainId, order.rawData),
      };
    }

    case "x2y2": {
      return {
        kind: "x2y2",
        ...common,
        order: new Sdk.X2Y2.Order(config.chainId, order.rawData),
      };
    }

    case "zeroex-v4-erc721":
    case "zeroex-v4-erc1155": {
      return {
        kind: "zeroex-v4",
        ...common,
        order: new Sdk.ZeroExV4.Order(config.chainId, order.rawData),
      };
    }

    case "seaport": {
      return {
        kind: "seaport",
        ...common,
        order: new Sdk.Seaport.Order(config.chainId, order.rawData),
      };
    }

    default: {
      throw new Error("Unsupported order kind");
    }
  }
};

// Support for filling bids
export const generateBidDetails = async (
  order: {
    kind: OrderKind;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rawData: any;
  },
  token: {
    kind: "erc721" | "erc1155";
    contract: string;
    tokenId: string;
  }
): Promise<BidDetails> => {
  const common = {
    contractKind: token.kind,
    contract: token.contract,
    tokenId: token.tokenId,
  };

  switch (order.kind) {
    case "seaport": {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const extraArgs: any = {};

      const sdkOrder = new Sdk.Seaport.Order(config.chainId, order.rawData);
      if (sdkOrder.params.kind?.includes("token-list")) {
        // When filling a "token-list" order, we also need to pass in the
        // full list of tokens the order was made on (in order to be able
        // to generate a valid merkle proof)
        const tokens = await redb.manyOrNone(
          `
            SELECT
              token_sets_tokens.token_id
            FROM token_sets_tokens
            WHERE token_sets_tokens.token_set_id = (
              SELECT
                orders.token_set_id
              FROM orders
              WHERE orders.id = $/id/
            )
          `,
          { id: sdkOrder.hash() }
        );
        extraArgs.tokenIds = tokens.map(({ token_id }) => token_id);
      }

      return {
        kind: "seaport",
        ...common,
        extraArgs,
        order: sdkOrder,
      };
    }

    case "looks-rare": {
      const sdkOrder = new Sdk.LooksRare.Order(config.chainId, order.rawData);
      return {
        kind: "looks-rare",
        ...common,
        order: sdkOrder,
      };
    }

    case "opendao-erc721":
    case "opendao-erc1155": {
      const sdkOrder = new Sdk.OpenDao.Order(config.chainId, order.rawData);
      return {
        kind: "opendao",
        ...common,
        order: sdkOrder,
      };
    }

    case "zeroex-v4-erc721":
    case "zeroex-v4-erc1155": {
      const sdkOrder = new Sdk.ZeroExV4.Order(config.chainId, order.rawData);
      return {
        kind: "zeroex-v4",
        ...common,
        order: sdkOrder,
      };
    }

    default: {
      throw new Error("Unsupported order kind");
    }
  }
};
