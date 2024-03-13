/* eslint-disable @typescript-eslint/no-explicit-any */

// Exports

export * as cryptopunks from "@/orderbook/orders/cryptopunks";
export * as element from "@/orderbook/orders/element";
export * as foundation from "@/orderbook/orders/foundation";
export * as seaport from "@/orderbook/orders/seaport-v1.1";
export * as seaportV14 from "@/orderbook/orders/seaport-v1.4";
export * as seaportV15 from "@/orderbook/orders/seaport-v1.5";
export * as alienswap from "@/orderbook/orders/alienswap";
export * as sudoswap from "@/orderbook/orders/sudoswap";
export * as x2y2 from "@/orderbook/orders/x2y2";
export * as zeroExV4 from "@/orderbook/orders/zeroex-v4";
export * as zora from "@/orderbook/orders/zora";
export * as blur from "@/orderbook/orders/blur";
export * as rarible from "@/orderbook/orders/rarible";
export * as nftx from "@/orderbook/orders/nftx";
export * as nftxV3 from "@/orderbook/orders/nftx-v3";
export * as manifold from "@/orderbook/orders/manifold";
export * as superrare from "@/orderbook/orders/superrare";
export * as looksRareV2 from "@/orderbook/orders/looks-rare-v2";
export * as sudoswapV2 from "@/orderbook/orders/sudoswap-v2";
export * as caviarV1 from "@/orderbook/orders/caviar-v1";
export * as paymentProcessor from "@/orderbook/orders/payment-processor";
export * as paymentProcessorV2 from "@/orderbook/orders/payment-processor-v2";

// Imports

import { HashZero } from "@ethersproject/constants";
import * as Sdk from "@reservoir0x/sdk";
import { Permit } from "@reservoir0x/sdk/dist/router/v6/permit";
import { BidDetails, ListingDetails } from "@reservoir0x/sdk/dist/router/v6/types";

import { inject } from "@/api/index";
import { idb } from "@/common/db";
import { config } from "@/config/index";
import { Sources } from "@/models/sources";
import { SourcesEntity } from "@/models/sources/sources-entity";
import { CollectionMintStandard } from "@/orderbook/mints";
import * as paymentProcessorV2BuildUtils from "@/orderbook/orders/payment-processor-v2/build/utils";
import { checkMarketplaceIsFiltered } from "@/utils/marketplace-blacklists";
import * as offchainCancel from "@/utils/offchain-cancel";
import * as paymentProcessorV2Utils from "@/utils/payment-processor-v2";
import * as onchain from "@/utils/royalties/onchain";

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
  | "seaport-v1.5"
  | "alienswap"
  | "rarible"
  | "element-erc721"
  | "element-erc1155"
  | "quixotic"
  | "nouns"
  | "zora-v3"
  | "mint"
  | "cryptopunks"
  | "sudoswap"
  | "nftx"
  | "nftx-v3"
  | "blur"
  | "manifold"
  | "tofu-nft"
  | "decentraland"
  | "nft-trader"
  | "okex"
  | "bend-dao"
  | "superrare"
  | "zeroex-v2"
  | "zeroex-v3"
  | "treasure"
  | "looks-rare-v2"
  | "blend"
  | "collectionxyz"
  | "sudoswap-v2"
  | "midaswap"
  | "caviar-v1"
  | "payment-processor"
  | "blur-v2"
  | "joepeg"
  | "payment-processor-v2"
  | "mooar";

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
mintsSources.set("0xb932a70a57673d89f4acffbe830e8ed7f75fb9e0", "superrare.com");

const standardMintSources = new Map<CollectionMintStandard, string>();
standardMintSources.set("manifold", "manifold.xyz");
standardMintSources.set("seadrop-v1.0", "opensea.io");
standardMintSources.set("thirdweb", "thirdweb.com");
standardMintSources.set("zora", "zora.co");
standardMintSources.set("decent", "decent.xyz");
standardMintSources.set("foundation", "foundation.app");
standardMintSources.set("lanyard", "lanyard.org");
standardMintSources.set("mintdotfun", "mint.fun");
standardMintSources.set("soundxyz", "sound.xyz");
standardMintSources.set("createdotfun", "mint.fun");
standardMintSources.set("titlesxyz", "titles.xyz");
standardMintSources.set("artblocks", "artblocks.io");
standardMintSources.set("highlightxyz", "highlight.xyz");
standardMintSources.set("bueno", "bueno.art");

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
      case "looks-rare-v2":
        return sources.getOrInsert("looksrare.org");
      case "seaport":
      case "seaport-v1.4":
      case "seaport-v1.5":
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
      case "sudoswap-v2":
        return sources.getOrInsert("sudoswap.xyz");
      case "caviar-v1":
        return sources.getOrInsert("caviar.sh");
      case "nftx":
        return sources.getOrInsert("v2.nftx.io");
      case "nftx-v3":
        return sources.getOrInsert("v3.nftx.io");
      case "blur":
      case "blur-v2":
      case "blend":
        return sources.getOrInsert("blur.io");
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
      case "alienswap":
        return sources.getOrInsert("alienswap.xyz");
      case "mooar":
        return sources.getOrInsert("mooar.com");
      case "mint": {
        if (address && mintsSources.has(address)) {
          return sources.getOrInsert(mintsSources.get(address)!);
        } else if (address) {
          return getMintSourceFromAddress(address);
        }
      }
    }
  } catch {
    // Skip any errors
  }

  // In case nothing matched, return `undefined` by default
};

export const getMintSourceFromAddress = async (
  address: string
): Promise<SourcesEntity | undefined> => {
  const result = await idb.oneOrNone(
    "SELECT standard FROM collection_mint_standards WHERE collection_id = $/collection/",
    { collection: address }
  );

  const standard = result?.standard;

  if (standard && standardMintSources.has(standard)) {
    const sources = await Sources.getInstance();
    return sources.getOrInsert(standardMintSources.get(standard)!);
  }
};

// Support for filling listings
export const generateListingDetailsV6 = async (
  order: {
    id: string;
    kind: OrderKind;
    currency: string;
    price: string;
    source?: string;
    rawData: any;
    fees?: Sdk.RouterV6.Types.Fee[];
  },
  token: {
    kind: "erc721" | "erc1155";
    contract: string;
    tokenId: string;
    amount?: number;
    isFlagged?: boolean;
  },
  taker: string,
  options?: {
    ppV2TrustedChannel?: string;
  }
): Promise<ListingDetails> => {
  const common = {
    orderId: order.id,
    contractKind: token.kind,
    contract: token.contract,
    tokenId: token.tokenId,
    currency: order.currency,
    price: order.price,
    source: order.source,
    isFlagged: token.isFlagged,
    amount: token.amount ?? 1,
    fees: order.fees ?? [],
  };

  switch (order.kind) {
    case "blur": {
      return {
        kind: "blur",
        ...common,
        order: order.rawData,
      };
    }

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
      return {
        kind: "seaport",
        ...common,
        order: new Sdk.SeaportV11.Order(config.chainId, order.rawData),
      };
    }

    case "seaport-v1.4": {
      const sdkOrder = new Sdk.SeaportV14.Order(config.chainId, order.rawData);
      await offchainCancel.seaport.doSignOrder(
        sdkOrder,
        taker,
        sdkOrder.buildMatching({
          tokenId: common.tokenId,
          amount: common.amount ?? 1,
        })
      );

      return {
        kind: "seaport-v1.4",
        ...common,
        order: sdkOrder,
      };
    }

    case "seaport-v1.5": {
      if (order.rawData && order.rawData.okxOrderId) {
        return {
          kind: "seaport-v1.5-partial-okx",
          ...common,
          order: {
            okxId: order.rawData.okxOrderId,
            id: order.id,
          } as Sdk.SeaportBase.Types.OkxPartialOrder,
        };
      } else if (order.rawData && order.rawData.partial) {
        return {
          kind: "seaport-v1.5-partial",
          ...common,
          order: {
            contract: token.contract,
            tokenId: token.tokenId,
            id: order.id,
          } as Sdk.SeaportBase.Types.OpenseaPartialOrder,
        };
      } else {
        // Make sure on-chain orders have a "defined" signature
        order.rawData.signature = order.rawData.signature ?? "0x";

        const sdkOrder = new Sdk.SeaportV15.Order(config.chainId, order.rawData);
        await offchainCancel.seaport.doSignOrder(
          sdkOrder,
          taker,
          sdkOrder.buildMatching({
            tokenId: common.tokenId,
            amount: common.amount ?? 1,
          })
        );

        return {
          kind: "seaport-v1.5",
          ...common,
          order: sdkOrder,
        };
      }
    }

    case "alienswap": {
      const sdkOrder = new Sdk.Alienswap.Order(config.chainId, order.rawData);
      await offchainCancel.seaport.doSignOrder(
        sdkOrder,
        taker,
        sdkOrder.buildMatching({
          tokenId: common.tokenId,
          amount: common.amount ?? 1,
        })
      );

      return {
        kind: "alienswap",
        ...common,
        order: sdkOrder,
      };
    }

    case "zora-v3": {
      return {
        kind: "zora",
        ...common,
        order: new Sdk.Zora.Order(config.chainId, order.rawData),
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

    case "nftx-v3": {
      return {
        kind: "nftx-v3",
        ...common,
        order: new Sdk.NftxV3.Order(config.chainId, order.rawData.pool, taker, order.rawData),
      };
    }

    case "manifold": {
      return {
        kind: "manifold",
        ...common,
        order: new Sdk.Manifold.Order(config.chainId, order.rawData),
      };
    }

    case "superrare": {
      return {
        kind: "superrare",
        ...common,
        order: new Sdk.SuperRare.Order(config.chainId, order.rawData),
      };
    }

    case "looks-rare-v2": {
      return {
        kind: "looks-rare-v2",
        ...common,
        order: new Sdk.LooksRareV2.Order(config.chainId, order.rawData),
      };
    }

    case "sudoswap-v2": {
      return {
        kind: "sudoswap-v2",
        ...common,
        order: new Sdk.SudoswapV2.Order(config.chainId, order.rawData),
      };
    }

    case "caviar-v1": {
      return {
        kind: "caviar-v1",
        ...common,
        order: new Sdk.CaviarV1.Order(config.chainId, order.rawData),
      };
    }

    case "payment-processor": {
      return {
        kind: "payment-processor",
        ...common,
        order: new Sdk.PaymentProcessor.Order(config.chainId, order.rawData),
      };
    }

    case "payment-processor-v2": {
      const sdkOrder = new Sdk.PaymentProcessorV2.Order(config.chainId, order.rawData);
      await offchainCancel.paymentProcessorV2.doSignOrder(sdkOrder, taker);

      const isBanned = await paymentProcessorV2Utils.checkAccountIsBanned(
        sdkOrder.params.tokenAddress,
        taker
      );
      if (isBanned) {
        throw new Error("Taker is banned");
      }

      const extraArgs: any = {};
      const settings = await paymentProcessorV2Utils.getConfigByContract(
        sdkOrder.params.tokenAddress
      );
      if (settings?.blockTradesFromUntrustedChannels) {
        const trustedChannels = await paymentProcessorV2Utils.getTrustedChannels(
          sdkOrder.params.tokenAddress
        );
        if (trustedChannels.length) {
          extraArgs.trustedChannel = trustedChannels[0].channel;
        }
      }

      if (options?.ppV2TrustedChannel) {
        extraArgs.trustedChannel = options.ppV2TrustedChannel;
      } else {
        extraArgs.trustedChannel =
          Sdk.PaymentProcessorV2.Addresses.ReservoirTrustedForwarder[config.chainId];
      }

      return {
        kind: "payment-processor-v2",
        ...common,
        extraArgs,
        order: sdkOrder,
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
    currency: string;
    rawData: any;
    source?: string;
    fees?: Sdk.RouterV6.Types.Fee[];
    builtInFeeBps?: number;
    isProtected?: boolean;
  },
  token: {
    kind: "erc721" | "erc1155";
    contract: string;
    tokenId: string;
    amount?: number;
    owner?: string;
  },
  taker: string,
  options?: {
    permit?: Permit;
    ppV2TrustedChannel?: string;
  }
): Promise<BidDetails> => {
  const common = {
    orderId: order.id,
    contractKind: token.kind,
    contract: token.contract,
    tokenId: token.tokenId,
    price: order.unitPrice,
    source: order.source,
    amount: token.amount ?? 1,
    owner: token.owner,
    isProtected: order.isProtected,
    builtInFeeBps: order.builtInFeeBps,
    currency: order.currency,
    fees: order.fees ?? [],
    permit: options?.permit,
  };

  switch (order.kind) {
    case "seaport": {
      const extraArgs: any = {};

      const sdkOrder = new Sdk.SeaportV11.Order(config.chainId, order.rawData);
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
    }

    case "seaport-v1.4": {
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

      await offchainCancel.seaport.doSignOrder(
        sdkOrder,
        taker,
        sdkOrder.buildMatching({
          tokenId: common.tokenId,
          amount: common.amount ?? 1,
          ...extraArgs,
        })
      );

      return {
        kind: "seaport-v1.4",
        ...common,
        extraArgs,
        order: sdkOrder,
      };
    }

    case "seaport-v1.5": {
      if (order.rawData && !order.rawData.partial) {
        const extraArgs: any = {};

        const sdkOrder = new Sdk.SeaportV15.Order(config.chainId, order.rawData);

        // Make sure on-chain orders have a "defined" signature
        sdkOrder.params.signature = sdkOrder.params.signature ?? "0x";

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

        await offchainCancel.seaport.doSignOrder(
          sdkOrder,
          taker,
          sdkOrder.buildMatching({
            tokenId: common.tokenId,
            amount: common.amount ?? 1,
            ...extraArgs,
          })
        );

        return {
          kind: "seaport-v1.5",
          ...common,
          extraArgs,
          order: sdkOrder,
        };
      } else {
        return {
          kind: "seaport-v1.5-partial",
          ...common,
          order: {
            contract: token.contract,
            tokenId: token.tokenId,
            id: order.id,
            unitPrice: order.unitPrice,
          } as Sdk.SeaportBase.Types.OpenseaPartialOrder,
        };
      }
    }

    case "alienswap": {
      const extraArgs: any = {};

      const sdkOrder = new Sdk.Alienswap.Order(config.chainId, order.rawData);
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

      await offchainCancel.seaport.doSignOrder(
        sdkOrder,
        taker,
        sdkOrder.buildMatching({
          tokenId: common.tokenId,
          amount: common.amount ?? 1,
          ...extraArgs,
        })
      );

      return {
        kind: "alienswap",
        ...common,
        order: sdkOrder,
        extraArgs,
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

    case "nftx-v3": {
      const sdkOrder = new Sdk.NftxV3.Order(
        config.chainId,
        order.rawData.pool,
        taker,
        order.rawData
      );
      return {
        kind: "nftx-v3",
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

    case "blur": {
      const sdkOrder = order.rawData as Sdk.Blur.Types.BlurBidPool;
      return {
        kind: "blur-bid",
        ...common,
        order: sdkOrder,
      };
    }

    case "looks-rare-v2": {
      const sdkOrder = new Sdk.LooksRareV2.Order(config.chainId, order.rawData);
      return {
        kind: "looks-rare-v2",
        ...common,
        order: sdkOrder,
      };
    }

    case "sudoswap-v2": {
      const sdkOrder = new Sdk.SudoswapV2.Order(config.chainId, order.rawData);
      return {
        kind: "sudoswap-v2",
        ...common,
        order: sdkOrder,
      };
    }

    case "caviar-v1": {
      const sdkOrder = new Sdk.CaviarV1.Order(config.chainId, order.rawData);

      const response = await inject({
        method: "GET",
        url: `/oracle/tokens/status/v2?tokens=${token.contract}:${token.tokenId}`,
        headers: {
          "Content-Type": "application/json",
        },
      });

      const { messages } = JSON.parse(response.payload);

      return {
        kind: "caviar-v1",
        ...common,
        order: sdkOrder,
        extraArgs: {
          stolenProof: messages[0].message,
        },
      };
    }

    case "payment-processor": {
      const sdkOrder = new Sdk.PaymentProcessor.Order(config.chainId, order.rawData);
      return {
        kind: "payment-processor",
        ...common,
        order: sdkOrder,
        extraArgs: {
          maxRoyaltyFeeNumerator: await onchain
            .getOnChainRoyalties(common.contract, common.tokenId, "onchain")
            .then((royalties) => royalties.map((r) => r.bps).reduce((a, b) => a + b, 0)),
        },
      };
    }

    case "payment-processor-v2": {
      const sdkOrder = new Sdk.PaymentProcessorV2.Order(config.chainId, order.rawData);
      await offchainCancel.paymentProcessorV2.doSignOrder(sdkOrder, taker);

      const isBanned = await paymentProcessorV2Utils.checkAccountIsBanned(
        sdkOrder.params.tokenAddress,
        taker
      );
      if (isBanned) {
        throw new Error("Taker is banned");
      }

      const extraArgs: any = {};

      if (sdkOrder.params.kind?.includes("token-set-offer-approval")) {
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

      const settings = await paymentProcessorV2Utils.getConfigByContract(
        sdkOrder.params.tokenAddress
      );
      if (settings?.blockTradesFromUntrustedChannels) {
        const trustedChannels = await paymentProcessorV2Utils.getTrustedChannels(
          sdkOrder.params.tokenAddress
        );
        if (trustedChannels.length) {
          extraArgs.trustedChannel = trustedChannels[0].channel;
        }
      }

      if (options?.ppV2TrustedChannel) {
        extraArgs.trustedChannel = options?.ppV2TrustedChannel;
      } else {
        extraArgs.trustedChannel =
          Sdk.PaymentProcessorV2.Addresses.ReservoirTrustedForwarder[config.chainId];
      }

      return {
        kind: "payment-processor-v2",
        ...common,
        order: sdkOrder,
        extraArgs: {
          ...extraArgs,
          maxRoyaltyFeeNumerator: await paymentProcessorV2BuildUtils
            .getRoyaltiesToBePaid(common.contract, common.tokenId)
            .then((royalties) => royalties.map((r) => r.bps).reduce((a, b) => a + b, 0)),
        },
      };
    }

    default: {
      throw new Error("Unsupported order kind");
    }
  }
};

// Check the collection's blacklist and override the `orderKind` and `orderbook` in the `params`
export const checkBlacklistAndFallback = async (
  collection: string,
  params: {
    orderKind: OrderKind;
    orderbook: string;
  }
) => {
  // Fallback to Seaport when LooksRare is blocked
  if (["looks-rare-v2"].includes(params.orderKind) && ["looks-rare"].includes(params.orderbook)) {
    const isBlocked = await checkMarketplaceIsFiltered(collection, [
      Sdk.LooksRareV2.Addresses.Exchange[config.chainId],
      Sdk.LooksRareV2.Addresses.TransferManager[config.chainId],
    ]);
    if (isBlocked) {
      params.orderKind = "seaport-v1.5";
    }
  }

  const seaportIsBlocked = await checkMarketplaceIsFiltered(collection, [
    Sdk.SeaportV15.Addresses.Exchange[config.chainId],
    new Sdk.SeaportV15.Exchange(config.chainId).deriveConduit(
      Sdk.SeaportBase.Addresses.OpenseaConduitKey[config.chainId] ?? HashZero
    ),
  ]);

  // Fallback to PaymentProcessor when Seaport is blocked
  if (
    ["seaport-v1.5"].includes(params.orderKind) &&
    ["reservoir"].includes(params.orderbook) &&
    seaportIsBlocked
  ) {
    params.orderKind = "payment-processor";
  }

  // Fallback to Seaport when PaymentProcessor is blocked
  if (
    ["payment-processor-v2"].includes(params.orderKind) &&
    ["reservoir"].includes(params.orderbook)
  ) {
    const isBlocked = await checkMarketplaceIsFiltered(collection, [
      Sdk.PaymentProcessorV2.Addresses.Exchange[config.chainId],
    ]);

    // https://linear.app/reservoir/issue/PRO-1163/failing-ppv1-purchase
    // const isBlockedCustom =
    //   config.chainId === 137 && collection === "0xdbc52cd5b8eda1a7bcbabb838ca927d23e3673e5";
    const isBlockedCustom = false;

    if (isBlocked || isBlockedCustom) {
      if (!seaportIsBlocked) {
        params.orderKind = "seaport-v1.5";
      } else {
        throw new Error("Collection is blocking all supported exchanges");
      }
    }
  }
};
