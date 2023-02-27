/* eslint-disable @typescript-eslint/no-explicit-any */

// Exports

export * as cryptopunks from "@/orderbook/orders/cryptopunks";
export * as element from "@/orderbook/orders/element";
export * as forward from "@/orderbook/orders/forward";
export * as foundation from "@/orderbook/orders/foundation";
export * as looksRare from "@/orderbook/orders/looks-rare";
export * as seaport from "@/orderbook/orders/seaport";
export * as seaportV14 from "@/orderbook/orders/seaport-v1.4";
export * as sudoswap from "@/orderbook/orders/sudoswap";
export * as x2y2 from "@/orderbook/orders/x2y2";
export * as zeroExV4 from "@/orderbook/orders/zeroex-v4";
export * as zora from "@/orderbook/orders/zora";
export * as universe from "@/orderbook/orders/universe";
export * as infinity from "@/orderbook/orders/infinity";
export * as flow from "@/orderbook/orders/flow";
export * as blur from "@/orderbook/orders/blur";
export * as rarible from "@/orderbook/orders/rarible";
export * as nftx from "@/orderbook/orders/nftx";
export * as manifold from "@/orderbook/orders/manifold";

// Imports
import * as Sdk from "@reservoir0x/sdk";
import * as SdkTypesV5 from "@reservoir0x/sdk/dist/router/v5/types";
import * as SdkTypesV6 from "@reservoir0x/sdk/dist/router/v6/types";

import { idb } from "@/common/db";
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
  | "foundation"
  | "x2y2"
  | "seaport"
  | "seaport-v1.4"
  | "rarible"
  | "element-erc721"
  | "element-erc1155"
  | "quixotic"
  | "nouns"
  | "zora-v3"
  | "mint"
  | "cryptopunks"
  | "sudoswap"
  | "universe"
  | "nftx"
  | "blur"
  | "infinity"
  | "flow"
  | "forward"
  | "manifold"
  | "tofu-nft"
  | "decentraland"
  | "nft-trader"
  | "okex"
  | "bend-dao"
  | "superrare"
  | "zeroex-v2";

// In case we don't have the source of an order readily available, we use
// a default value where possible (since very often the exchange protocol
// is tightly coupled to a source marketplace and we just assume that the
// bulk of orders from a protocol come from known that marketplace).

const mintsSources = new Map<string, string>();
mintsSources.set("0x059edd72cd353df5106d2b9cc5ab83a52287ac3a", "artblocks.io");
mintsSources.set("0xa7d8d9ef8d8ce8992df33d8b8cf4aebabd5bd270", "artblocks.io");
mintsSources.set("0x57f1887a8bf19b14fc0df6fd9b2acc9af147ea85", "ens.domains");
mintsSources.set("0x495f947276749ce646f68ac8c248420045cb7b5e", "opensea.io");
mintsSources.set("0xc9154424b823b10579895ccbe442d41b9abd96ed", "rarible.com");
mintsSources.set("0xb66a603f4cfe17e3d27b87a8bfcad319856518b8", "rarible.com");
mintsSources.set("0xc143bbfcdbdbed6d454803804752a064a622c1f3", "async.art");
mintsSources.set("0xfbeef911dc5821886e1dda71586d90ed28174b7d", "knownorigin.io");

export const getOrderSourceByOrderId = async (
  orderId: string
): Promise<SourcesEntity | undefined> => {
  try {
    const result = await idb.oneOrNone(
      `
        SELECT
          orders.source_id_int
        FROM orders
        WHERE orders.id = $/orderId/
        LIMIT 1
      `,
      { orderId }
    );
    if (result) {
      const sources = await Sources.getInstance();
      return sources.get(result.order_source_id_int);
    }
  } catch {
    // Skip any errors
  }

  // In case nothing matched, return `undefined` by default
};

export const getOrderSourceByOrderKind = async (
  orderKind: OrderKind,
  address?: string
): Promise<SourcesEntity | undefined> => {
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
      case "seaport-v1.4":
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
      case "cryptopunks":
        return sources.getOrInsert("cryptopunks.app");
      case "sudoswap":
        return sources.getOrInsert("sudoswap.xyz");
      case "universe":
        return sources.getOrInsert("universe.xyz");
      case "nftx":
        return sources.getOrInsert("nftx.io");
      case "blur":
        return sources.getOrInsert("blur.io");
      case "infinity":
        return sources.getOrInsert("infinity.xyz");
      case "flow":
        return sources.getOrInsert("flow.so");
      case "manifold":
        return sources.getOrInsert("manifold.xyz");
      case "tofu-nft":
        return sources.getOrInsert("tofunft.com");
      case "decentraland":
        return sources.getOrInsert("market.decentraland.org");
      case "nft-trader":
        return sources.getOrInsert("nfttrader.io");
      case "okex":
        return sources.getOrInsert("okx.com");
      case "bend-dao":
        return sources.getOrInsert("benddao.xyz");
      case "superrare":
        return sources.getOrInsert("superrare.com");

      case "mint": {
        if (address && mintsSources.has(address)) {
          return sources.getOrInsert(mintsSources.get(address)!);
        }
      }
    }
  } catch {
    // Skip any errors
  }

  // In case nothing matched, return `undefined` by default
};

// Support for filling listings
export const generateListingDetailsV6 = (
  order: {
    id: string;
    kind: OrderKind;
    currency: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rawData: any;
    fees?: Sdk.RouterV6.Types.Fee[];
  },
  token: {
    kind: "erc721" | "erc1155";
    contract: string;
    tokenId: string;
    amount?: number;
  }
): SdkTypesV6.ListingDetails => {
  const common = {
    contractKind: token.kind,
    contract: token.contract,
    tokenId: token.tokenId,
    currency: order.currency,
    amount: token.amount ?? 1,
    fees: order.fees ?? [],
  };

  switch (order.kind) {
    case "cryptopunks": {
      return {
        kind: "cryptopunks",
        ...common,
        order: new Sdk.CryptoPunks.Order(config.chainId, order.rawData),
      };
    }

    case "foundation": {
      return {
        kind: "foundation",
        ...common,
        order: new Sdk.Foundation.Order(config.chainId, order.rawData),
      };
    }

    case "element-erc721":
    case "element-erc1155": {
      return {
        kind: "element",
        ...common,
        order: new Sdk.Element.Order(config.chainId, order.rawData),
      };
    }

    case "looks-rare": {
      return {
        kind: "looks-rare",
        ...common,
        order: new Sdk.LooksRare.Order(config.chainId, order.rawData),
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
      if (order.rawData && !order.rawData.partial) {
        return {
          kind: "seaport",
          ...common,
          order: new Sdk.Seaport.Order(config.chainId, order.rawData),
        };
      } else {
        // Sorry for all the below `any` types
        return {
          // eslint-disable-next-line
          kind: "seaport-partial" as any,
          ...common,
          order: {
            contract: token.contract,
            tokenId: token.tokenId,
            id: order.id,
            // eslint-disable-next-line
          } as any,
        };
      }
    }

    case "seaport-v1.4": {
      if (order.rawData && !order.rawData.partial) {
        return {
          kind: "seaport-v1.4",
          ...common,
          order: new Sdk.SeaportV14.Order(config.chainId, order.rawData),
        };
      } else {
        // Sorry for all the below `any` types
        return {
          // eslint-disable-next-line
          kind: "seaport-v1.4-partial" as any,
          ...common,
          order: {
            contract: token.contract,
            tokenId: token.tokenId,
            id: order.id,
            // eslint-disable-next-line
          } as any,
        };
      }
    }

    case "zora-v3": {
      return {
        kind: "zora",
        ...common,
        order: new Sdk.Zora.Order(config.chainId, order.rawData),
      };
    }

    case "universe": {
      return {
        kind: "universe",
        ...common,
        order: new Sdk.Universe.Order(config.chainId, order.rawData),
      };
    }

    case "infinity": {
      const sdkOrder = new Sdk.Infinity.Order(config.chainId, order.rawData);
      return {
        kind: "infinity",
        ...common,
        order: sdkOrder,
      };
    }

    case "flow": {
      const sdkOrder = new Sdk.Flow.Order(config.chainId, order.rawData);
      return {
        kind: "flow",
        ...common,
        order: sdkOrder,
      };
    }

    case "rarible": {
      return {
        kind: "rarible",
        ...common,
        order: new Sdk.Rarible.Order(config.chainId, order.rawData),
      };
    }

    case "sudoswap": {
      return {
        kind: "sudoswap",
        ...common,
        order: new Sdk.Sudoswap.Order(config.chainId, order.rawData),
      };
    }

    case "nftx": {
      return {
        kind: "nftx",
        ...common,
        order: new Sdk.Nftx.Order(config.chainId, order.rawData),
      };
    }

    case "manifold": {
      return {
        kind: "manifold",
        ...common,
        order: new Sdk.Manifold.Order(config.chainId, order.rawData),
      };
    }

    default: {
      throw new Error("Unsupported order kind");
    }
  }
};

// Support for filling bids
export const generateBidDetailsV6 = async (
  order: {
    id: string;
    kind: OrderKind;
    unitPrice: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rawData: any;
    fees?: Sdk.RouterV6.Types.Fee[];
  },
  token: {
    kind: "erc721" | "erc1155";
    contract: string;
    tokenId: string;
    amount?: number;
    owner?: string;
  }
): Promise<SdkTypesV6.BidDetails> => {
  const common = {
    contractKind: token.kind,
    contract: token.contract,
    tokenId: token.tokenId,
    amount: token.amount ?? 1,
    owner: token.owner,
    fees: order.fees ?? [],
  };

  switch (order.kind) {
    case "seaport": {
      if (order.rawData && !order.rawData.partial) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const extraArgs: any = {};

        const sdkOrder = new Sdk.Seaport.Order(config.chainId, order.rawData);
        if (sdkOrder.params.kind?.includes("token-list")) {
          // When filling a "token-list" order, we also need to pass in the
          // full list of tokens the order was made on (in order to be able
          // to generate a valid merkle proof)
          const tokens = await idb.manyOrNone(
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
      } else {
        // Sorry for all the below `any` types
        return {
          // eslint-disable-next-line
          kind: "seaport-partial" as any,
          ...common,
          order: {
            contract: token.contract,
            tokenId: token.tokenId,
            id: order.id,
            unitPrice: order.unitPrice,
            // eslint-disable-next-line
          } as any,
        };
      }
    }

    case "seaport-v1.4": {
      if (order.rawData && !order.rawData.partial) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const extraArgs: any = {};

        const sdkOrder = new Sdk.SeaportV14.Order(config.chainId, order.rawData);
        if (sdkOrder.params.kind?.includes("token-list")) {
          // When filling a "token-list" order, we also need to pass in the
          // full list of tokens the order was made on (in order to be able
          // to generate a valid merkle proof)
          const tokens = await idb.manyOrNone(
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
          kind: "seaport-v1.4",
          ...common,
          extraArgs,
          order: sdkOrder,
        };
      } else {
        // Sorry for all the below `any` types
        return {
          // eslint-disable-next-line
          kind: "seaport-v1.4-partial" as any,
          ...common,
          order: {
            contract: token.contract,
            tokenId: token.tokenId,
            id: order.id,
            unitPrice: order.unitPrice,
            // eslint-disable-next-line
          } as any,
        };
      }
    }

    case "looks-rare": {
      const sdkOrder = new Sdk.LooksRare.Order(config.chainId, order.rawData);
      return {
        kind: "looks-rare",
        ...common,
        order: sdkOrder,
      };
    }

    case "element-erc721":
    case "element-erc1155": {
      return {
        kind: "element",
        ...common,
        order: new Sdk.Element.Order(config.chainId, order.rawData),
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

    case "x2y2": {
      const sdkOrder = new Sdk.X2Y2.Order(config.chainId, order.rawData);
      return {
        kind: "x2y2",
        ...common,
        order: sdkOrder,
      };
    }

    case "sudoswap": {
      const sdkOrder = new Sdk.Sudoswap.Order(config.chainId, order.rawData);
      return {
        kind: "sudoswap",
        ...common,
        order: sdkOrder,
      };
    }

    case "nftx": {
      const sdkOrder = new Sdk.Nftx.Order(config.chainId, order.rawData);
      return {
        kind: "nftx",
        ...common,
        order: sdkOrder,
      };
    }

    case "universe": {
      const sdkOrder = new Sdk.Universe.Order(config.chainId, order.rawData);
      return {
        kind: "universe",
        ...common,
        order: sdkOrder,
      };
    }

    case "infinity": {
      const sdkOrder = new Sdk.Infinity.Order(config.chainId, order.rawData);
      return {
        kind: "infinity",
        ...common,
        order: sdkOrder,
      };
    }

    case "flow": {
      const sdkOrder = new Sdk.Flow.Order(config.chainId, order.rawData);
      return {
        kind: "flow",
        ...common,
        order: sdkOrder,
      };
    }

    case "rarible": {
      return {
        kind: "rarible",
        ...common,
        order: new Sdk.Rarible.Order(config.chainId, order.rawData),
      };
    }

    case "forward": {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const extraArgs: any = {};

      const sdkOrder = new Sdk.Forward.Order(config.chainId, order.rawData);
      if (sdkOrder.params.kind?.includes("token-list")) {
        // When filling a "token-list" order, we also need to pass in the
        // full list of tokens the order was made on (in order to be able
        // to generate a valid merkle proof)
        const tokens = await idb.manyOrNone(
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
        kind: "forward",
        ...common,
        extraArgs,
        order: sdkOrder,
      };
    }

    case "blur": {
      const sdkOrder = new Sdk.Blur.Order(config.chainId, order.rawData);
      return {
        kind: "blur",
        ...common,
        order: sdkOrder,
      };
    }

    default: {
      throw new Error("Unsupported order kind");
    }
  }
};

// DEPRECATED

// Support for filling listings
export const generateListingDetailsV5 = (
  order: {
    id: string;
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
): SdkTypesV5.ListingDetails => {
  const common = {
    contractKind: token.kind,
    contract: token.contract,
    tokenId: token.tokenId,
    currency: order.currency,
    amount: token.amount ?? 1,
  };

  switch (order.kind) {
    case "cryptopunks": {
      return {
        kind: "cryptopunks",
        ...common,
        order: new Sdk.CryptoPunks.Order(config.chainId, order.rawData),
      };
    }

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
      if (order.rawData) {
        return {
          kind: "seaport",
          ...common,
          order: new Sdk.Seaport.Order(config.chainId, order.rawData),
        };
      } else {
        // Sorry for all the below `any` types
        return {
          // eslint-disable-next-line
          kind: "seaport-partial" as any,
          ...common,
          order: {
            contract: token.contract,
            tokenId: token.tokenId,
            id: order.id,
            // eslint-disable-next-line
          } as any,
        };
      }
    }

    case "zora-v3": {
      return {
        kind: "zora",
        ...common,
        order: new Sdk.Zora.Order(config.chainId, order.rawData),
      };
    }

    case "universe": {
      return {
        kind: "universe",
        ...common,
        order: new Sdk.Universe.Order(config.chainId, order.rawData),
      };
    }

    case "rarible": {
      return {
        kind: "rarible",
        ...common,
        order: new Sdk.Rarible.Order(config.chainId, order.rawData),
      };
    }

    default: {
      throw new Error("Unsupported order kind");
    }
  }
};

// Support for filling bids
export const generateBidDetailsV5 = async (
  order: {
    id: string;
    kind: OrderKind;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rawData: any;
  },
  token: {
    kind: "erc721" | "erc1155";
    contract: string;
    tokenId: string;
    amount?: number;
  }
): Promise<SdkTypesV5.BidDetails> => {
  const common = {
    contractKind: token.kind,
    contract: token.contract,
    tokenId: token.tokenId,
    amount: token.amount ?? 1,
  };

  switch (order.kind) {
    case "seaport": {
      if (order.rawData) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const extraArgs: any = {};

        const sdkOrder = new Sdk.Seaport.Order(config.chainId, order.rawData);
        if (sdkOrder.params.kind?.includes("token-list")) {
          // When filling a "token-list" order, we also need to pass in the
          // full list of tokens the order was made on (in order to be able
          // to generate a valid merkle proof)
          const tokens = await idb.manyOrNone(
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
      } else {
        // Sorry for all the below `any` types
        return {
          // eslint-disable-next-line
          kind: "seaport-partial" as any,
          ...common,
          order: {
            contract: token.contract,
            tokenId: token.tokenId,
            id: order.id,
            // eslint-disable-next-line
          } as any,
        };
      }
    }

    case "looks-rare": {
      const sdkOrder = new Sdk.LooksRare.Order(config.chainId, order.rawData);
      return {
        kind: "looks-rare",
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

    case "x2y2": {
      const sdkOrder = new Sdk.X2Y2.Order(config.chainId, order.rawData);
      return {
        kind: "x2y2",
        ...common,
        order: sdkOrder,
      };
    }

    case "sudoswap": {
      const sdkOrder = new Sdk.Sudoswap.Order(config.chainId, order.rawData);
      return {
        kind: "sudoswap",
        ...common,
        order: sdkOrder,
      };
    }

    case "universe": {
      const sdkOrder = new Sdk.Universe.Order(config.chainId, order.rawData);
      return {
        kind: "universe",
        ...common,
        order: sdkOrder,
        extraArgs: {
          amount: sdkOrder.params.take.value,
        },
      };
    }

    case "rarible": {
      const sdkOrder = new Sdk.Rarible.Order(config.chainId, order.rawData);
      return {
        kind: "rarible",
        ...common,
        order: sdkOrder,
      };
    }

    default: {
      throw new Error("Unsupported order kind");
    }
  }
};
