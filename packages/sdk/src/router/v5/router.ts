import { Interface } from "@ethersproject/abi";
import { Provider } from "@ethersproject/abstract-provider";
import { AddressZero } from "@ethersproject/constants";
import { Contract } from "@ethersproject/contracts";
import axios from "axios";

import * as Addresses from "./addresses";
import { ExchangeKind, BidDetails, ListingDetails } from "./types";
import * as Sdk from "../../index";
import { TxData, bn, generateSourceBytes } from "../../utils";

import Erc721Abi from "../../common/abis/Erc721.json";
import Erc1155Abi from "../../common/abis/Erc1155.json";
import RouterAbi from "./abis/ReservoirV5_0_0.json";

type SetupOptions = {
  x2y2ApiKey?: string;
};

export class Router {
  public chainId: number;
  public contract: Contract;
  public provider: Provider;
  public options?: SetupOptions;

  constructor(chainId: number, provider: Provider, options?: SetupOptions) {
    this.chainId = chainId;
    this.contract = new Contract(
      Addresses.Router[chainId],
      RouterAbi,
      provider
    );
    this.provider = provider;
    this.options = options;
  }

  public async fillListingsTx(
    details: ListingDetails[],
    taker: string,
    options?: {
      source?: string;
      fee?: {
        recipient: string;
        bps: number | string;
      };
      skipPrecheck?: boolean;
      forceRouter?: boolean;
      skipErrors?: boolean;
      skippedIndexes?: number[];
      partial?: boolean;
      directFillingData?: any;
    }
  ): Promise<TxData> {
    // Assume the listing details are consistent with the underlying order object

    // Orders on exchanges that support batch filling will be batch filled
    // natively so that filling is as efficient as possible while the rest
    // of the orders will be filled individually.

    // Native batch filling:
    // - OpenDao
    // - Seaport
    // - X2Y2 (not supported yet)
    // - ZeroExV4

    if (details.some(({ kind }) => kind === "zora")) {
      if (details.length > 1) {
        throw new Error("Zora sweeping is not supported");
      } else {
        const order = details[0].order as Sdk.Zora.Order;
        const exchange = new Sdk.Zora.Exchange(this.chainId);
        return exchange.fillOrderTx(taker, order);
      }
    }

    if (details.some(({ kind }) => kind === "universe")) {
      if (details.length > 1) {
        throw new Error("Universe sweeping is not supported");
      } else {
        const order = details[0].order as Sdk.Universe.Order;
        const exchange = new Sdk.Universe.Exchange(this.chainId);
        return exchange.fillOrderTx(taker, order, {
          amount: Number(details[0].amount),
          source: options?.source,
        });
      }
    }

    if (details.some(({ kind }) => kind === "rarible")) {
      if (details.length > 1) {
        throw new Error("Rarible sweeping is not supported");
      } else {
        const order = details[0].order as Sdk.Rarible.Order;
        const exchange = new Sdk.Rarible.Exchange(this.chainId);
        return exchange.fillOrderTx(taker, order, {
          tokenId: details[0].tokenId,
          assetClass: details[0].contractKind.toUpperCase(),
          amount: Number(details[0].amount),
          source: options?.source,
        });
      }
    }

    // Handle partial seaport orders:
    // - fetch the full order data for each partial order (concurrently)
    // - remove any partial order from the details
    await Promise.all(
      details
        .filter(({ kind }) => kind === "seaport-partial")
        .map(async (detail) => {
          const order = detail.order as Sdk.Seaport.Types.PartialOrder;
          const result = await axios.get(
            `https://order-fetcher.vercel.app/api/listing?orderHash=${order.id}&contract=${order.contract}&tokenId=${order.tokenId}&taker=${taker}&chainId=${this.chainId}`
          );

          const fullOrder = new Sdk.Seaport.Order(
            this.chainId,
            result.data.order
          );
          details.push({
            ...detail,
            kind: "seaport",
            order: fullOrder,
          });
        })
    );
    details = details.filter(({ kind }) => kind !== "seaport-partial");

    // If all orders are Seaport, then we fill on Seaport directly
    // TODO: Once the modular router is implemented, a refactoring
    // might be needed - to use the router-generated order instead
    // of treating Seaport as a special case (this is not possible
    // at the moment because the router has separate functions for
    // filling ERC721 vs ERC1155).
    if (
      details.every(({ kind }) => kind === "seaport") &&
      // TODO: Look into using tips for fees on top (only doable on Seaport)
      (!options?.fee || Number(options.fee.bps) === 0) &&
      // Skip direct filling if disabled via the options
      !options?.forceRouter
    ) {
      const exchange = new Sdk.Seaport.Exchange(this.chainId);
      if (details.length === 1) {
        const order = details[0].order as Sdk.Seaport.Order;
        return exchange.fillOrderTx(
          taker,
          order,
          order.buildMatching({ amount: details[0].amount }),
          {
            ...options,
            ...options?.directFillingData,
          }
        );
      } else {
        const orders = details.map((d) => d.order as Sdk.Seaport.Order);
        return exchange.fillOrdersTx(
          taker,
          orders,
          orders.map((order, i) =>
            order.buildMatching({ amount: details[i].amount })
          ),
          {
            ...options,
            ...options?.directFillingData,
          }
        );
      }
    }

    // TODO: Refactor with the new modular router
    if (details.length === 1 && details[0].kind === "cryptopunks") {
      const exchange = new Sdk.CryptoPunks.Exchange(this.chainId);
      return exchange.fillListingTx(taker, details[0].order, options);
    }

    // Ensure all listings are in ETH
    if (
      !details.every(
        (d) => d.currency === Sdk.Common.Addresses.Eth[this.chainId]
      )
    ) {
      throw new Error("Only ETH listings are fillable through the router");
    }

    // Keep track of batch-fillable orders
    const zeroexV4Erc721Details: ListingDetails[] = [];
    const zeroexV4Erc1155Details: ListingDetails[] = [];
    for (let i = 0; i < details.length; i++) {
      const { kind, contractKind } = details[i];
      switch (kind) {
        case "zeroex-v4": {
          (contractKind === "erc721"
            ? zeroexV4Erc721Details
            : zeroexV4Erc1155Details
          ).push(details[i]);
          break;
        }
      }
    }

    const fee = options?.fee ? options.fee : { recipient: AddressZero, bps: 0 };

    // Keep track of all listings to be filled through the router
    const routerTxs: TxData[] = [];

    if (zeroexV4Erc721Details.length > 1) {
      const exchange = new Sdk.ZeroExV4.Exchange(this.chainId);
      const tx = await exchange.batchBuyTx(
        taker,
        zeroexV4Erc1155Details.map(
          (detail) => detail.order as Sdk.ZeroExV4.Order
        ),
        zeroexV4Erc1155Details.map((detail) =>
          (detail.order as Sdk.ZeroExV4.Order).buildMatching({
            amount: detail.amount ?? 1,
          })
        )
      );

      routerTxs.push({
        from: taker,
        to: this.contract.address,
        data: this.contract.interface.encodeFunctionData(
          "batchERC721ListingFill",
          [
            tx.data,
            zeroexV4Erc721Details.map((detail) => detail.contract),
            zeroexV4Erc721Details.map((detail) => detail.tokenId),
            taker,
            fee.recipient,
            fee.bps,
          ]
        ),
        value: bn(tx.value!)
          .add(bn(tx.value!).mul(fee.bps).div(10000))
          .toHexString(),
      });

      // Delete any batch-filled orders
      details = details.filter(
        ({ kind, contractKind }) =>
          kind !== "zeroex-v4" && contractKind !== "erc721"
      );
    }
    if (zeroexV4Erc1155Details.length > 1) {
      const exchange = new Sdk.ZeroExV4.Exchange(this.chainId);
      const tx = await exchange.batchBuyTx(
        taker,
        zeroexV4Erc1155Details.map(
          (detail) => detail.order as Sdk.ZeroExV4.Order
        ),
        zeroexV4Erc1155Details.map((detail) =>
          (detail.order as Sdk.ZeroExV4.Order).buildMatching({
            amount: detail.amount ?? 1,
          })
        )
      );

      routerTxs.push({
        from: taker,
        to: this.contract.address,
        data: this.contract.interface.encodeFunctionData(
          "batchERC1155ListingFill",
          [
            tx.data,
            zeroexV4Erc1155Details.map((detail) => detail.contract),
            zeroexV4Erc1155Details.map((detail) => detail.tokenId),
            zeroexV4Erc1155Details.map((detail) => detail.amount ?? 1),
            taker,
            fee.recipient,
            fee.bps,
          ]
        ),
        value: bn(tx.value!)
          .add(bn(tx.value!).mul(fee.bps).div(10000))
          .toHexString(),
      });

      // Delete any batch-filled orders
      details = details.filter(
        ({ kind, contractKind }) =>
          kind !== "zeroex-v4" && contractKind !== "erc1155"
      );
    }

    // Rest of orders are individually filled
    await Promise.all(
      details.map(async (detail, i) => {
        try {
          const { tx, exchangeKind, maker, isEscrowed } =
            await this.generateNativeListingFillTx(detail, taker, options);

          if (detail.contractKind === "erc721") {
            routerTxs.push({
              from: taker,
              to: this.contract.address,
              data:
                !options?.skipPrecheck && !isEscrowed
                  ? this.contract.interface.encodeFunctionData(
                      "singleERC721ListingFillWithPrecheck",
                      [
                        tx.data,
                        exchangeKind,
                        detail.contract,
                        detail.tokenId,
                        taker,
                        maker,
                        fee.recipient,
                        fee.bps,
                      ]
                    )
                  : this.contract.interface.encodeFunctionData(
                      "singleERC721ListingFill",
                      [
                        tx.data,
                        exchangeKind,
                        detail.contract,
                        detail.tokenId,
                        taker,
                        fee.recipient,
                        fee.bps,
                      ]
                    ),
              value: bn(tx.value!)
                // Add the referrer fee
                .add(bn(tx.value!).mul(fee.bps).div(10000))
                .toHexString(),
            });
          } else {
            routerTxs.push({
              from: taker,
              to: this.contract.address,
              data:
                !options?.skipPrecheck && !isEscrowed
                  ? this.contract.interface.encodeFunctionData(
                      "singleERC1155ListingFillWithPrecheck",
                      [
                        tx.data,
                        exchangeKind,
                        detail.contract,
                        detail.tokenId,
                        detail.amount ?? 1,
                        taker,
                        maker,
                        fee.recipient,
                        fee.bps,
                      ]
                    )
                  : this.contract.interface.encodeFunctionData(
                      "singleERC1155ListingFill",
                      [
                        tx.data,
                        exchangeKind,
                        detail.contract,
                        detail.tokenId,
                        detail.amount ?? 1,
                        taker,
                        fee.recipient,
                        fee.bps,
                      ]
                    ),
              value: bn(tx.value!)
                // Add the referrer fee
                .add(bn(tx.value!).mul(fee.bps).div(10000))
                .toHexString(),
            });
          }
        } catch (error) {
          if (!options?.skipErrors) {
            throw error;
          } else if (options?.skippedIndexes) {
            options.skippedIndexes.push(i);
          }
        }
      })
    );

    if (routerTxs.length === 1) {
      return {
        ...routerTxs[0],
        data: routerTxs[0].data + generateSourceBytes(options?.source),
      };
    } else if (routerTxs.length > 1) {
      return {
        from: taker,
        to: this.contract.address,
        data:
          this.contract.interface.encodeFunctionData("multiListingFill", [
            routerTxs.map((tx) => tx.data),
            routerTxs.map((tx) => tx.value!.toString()),
            !options?.partial,
          ]) + generateSourceBytes(options?.source),
        value: routerTxs
          .map((tx) => bn(tx.value!))
          .reduce((a, b) => a.add(b), bn(0))
          .toHexString(),
      };
    } else {
      throw new Error("Could not generate transaction");
    }
  }

  public async fillBidTx(
    detail: BidDetails,
    taker: string,
    options?: {
      source?: string;
    }
  ) {
    // Assume the bid details are consistent with the underlying order object

    if (detail.kind === "universe") {
      const order = detail.order as Sdk.Universe.Order;
      const exchange = new Sdk.Universe.Exchange(this.chainId);
      return exchange.fillOrderTx(taker, order, {
        amount: Number(detail.extraArgs.amount),
      });
    }

    if (detail.kind === "rarible") {
      const order = detail.order as Sdk.Rarible.Order;
      const exchange = new Sdk.Rarible.Exchange(this.chainId);
      return exchange.fillOrderTx(taker, order, {
        tokenId: detail.tokenId,
        assetClass: detail.contractKind.toUpperCase(),
        amount: Number(detail.extraArgs.amount),
      });
    }

    const { tx, exchangeKind } = await this.generateNativeBidFillTx(
      detail,
      taker,
      options
    );

    // The V5 router does not support filling X2Y2 bids, so we fill directly
    if (exchangeKind === ExchangeKind.X2Y2) {
      return {
        from: taker,
        to: Sdk.X2Y2.Addresses.Exchange[this.chainId],
        data: tx.data + generateSourceBytes(options?.source),
      };
    }

    // The V5 router does not support filling Sudoswap bids, so we fill directly
    if (exchangeKind === ExchangeKind.SUDOSWAP) {
      return {
        from: taker,
        to: Sdk.Sudoswap.Addresses.RouterWithRoyalties[this.chainId],
        data: tx.data + generateSourceBytes(options?.source),
      };
    }

    // Wrap the exchange-specific fill transaction via the router
    // (use the `onReceived` hooks for single token filling)
    if (detail.contractKind === "erc721") {
      return {
        from: taker,
        to: detail.contract,
        data:
          new Interface(Erc721Abi).encodeFunctionData(
            "safeTransferFrom(address,address,uint256,bytes)",
            [
              taker,
              this.contract.address,
              detail.tokenId,
              this.contract.interface.encodeFunctionData(
                "singleERC721BidFill",
                [tx.data, exchangeKind, detail.contract, taker, true]
              ),
            ]
          ) + generateSourceBytes(options?.source),
      };
    } else {
      return {
        from: taker,
        to: detail.contract,
        data:
          new Interface(Erc1155Abi).encodeFunctionData(
            "safeTransferFrom(address,address,uint256,uint256,bytes)",
            [
              taker,
              this.contract.address,
              detail.tokenId,
              // TODO: Support selling a quantity greater than 1
              1,
              this.contract.interface.encodeFunctionData(
                "singleERC1155BidFill",
                [tx.data, exchangeKind, detail.contract, taker, true]
              ),
            ]
          ) + generateSourceBytes(options?.source),
      };
    }

    // Direct filling (requires approval):
    // const { tx } = await this.generateNativeBidFillTx(detail, taker, {
    //   noRouter: true,
    // });

    // return {
    //   ...tx,
    //   data: tx.data + generateReferrerBytes(options?.source),
    // };
  }

  private async generateNativeListingFillTx(
    { kind, order, tokenId, amount, contractKind }: ListingDetails,
    taker: string,
    options?: {
      source?: string;
    }
  ): Promise<{
    tx: TxData;
    exchangeKind: ExchangeKind;
    maker: string;
    isEscrowed?: boolean;
  }> {
    // In all below cases we set the router contract as the taker
    // since forwarding any received token to the actual taker of
    // the order will be done on-chain by the router (unless it's
    // possible to specify a token recipient other than the taker
    // natively - only Wyvern V2.3 supports this).

    if (kind === "foundation") {
      order = order as Sdk.Foundation.Order;

      const exchange = new Sdk.Foundation.Exchange(this.chainId);
      return {
        tx: exchange.fillOrderTx(this.contract.address, order),
        exchangeKind: ExchangeKind.FOUNDATION,
        maker: order.params.maker,
        isEscrowed: true,
      };
    } else if (kind === "looks-rare") {
      order = order as Sdk.LooksRare.Order;

      const matchParams = order.buildMatching(this.contract.address, {
        tokenId,
      });

      const exchange = new Sdk.LooksRare.Exchange(this.chainId);
      return {
        tx: exchange.fillOrderTx(this.contract.address, order, matchParams),
        exchangeKind: ExchangeKind.LOOKS_RARE,
        maker: order.params.signer,
      };
    } else if (kind === "x2y2") {
      order = order as Sdk.X2Y2.Order;

      // X2Y2 requires an API key to fill
      const exchange = new Sdk.X2Y2.Exchange(
        this.chainId,
        String(this.options?.x2y2ApiKey)
      );
      return {
        tx: await exchange.fillOrderTx(this.contract.address, order, options),
        exchangeKind: ExchangeKind.X2Y2,
        maker: order.params.maker,
      };
    } else if (kind === "zeroex-v4") {
      order = order as Sdk.ZeroExV4.Order;

      // Support passing an amount for partially fillable erc1155 orders
      const matchParams = order.buildMatching({ amount });

      const exchange = new Sdk.ZeroExV4.Exchange(this.chainId);
      return {
        tx: await exchange.fillOrderTx(
          this.contract.address,
          order,
          matchParams
        ),
        exchangeKind: ExchangeKind.ZEROEX_V4,
        maker: order.params.maker,
      };
    } else if (kind === "seaport") {
      order = order as Sdk.Seaport.Order;

      // Support passing an amount for partially fillable orders
      const matchParams = order.buildMatching({ amount });

      const exchange = new Sdk.Seaport.Exchange(this.chainId);
      return {
        tx: await exchange.fillOrderTx(
          this.contract.address,
          order,
          matchParams,
          {
            recipient: taker,
          }
        ),
        exchangeKind: ExchangeKind.SEAPORT,
        maker: order.params.offerer,
      };
    } else if (kind === "universe") {
      order = order as Sdk.Universe.Order;

      const exchange = new Sdk.Universe.Exchange(this.chainId);
      return {
        tx: await exchange.fillOrderTx(taker, order, {
          amount: Number(amount) ?? 1,
        }),
        exchangeKind: ExchangeKind.UNIVERSE,
        maker: order.params.maker,
      };
    } else if (kind === "element") {
      order = order as Sdk.Element.Order;

      // Support passing an amount for partially fillable erc1155 orders
      const matchParams = order.buildMatching({ amount });

      const exchange = new Sdk.Element.Exchange(this.chainId);
      return {
        tx: exchange.fillOrderTx(this.contract.address, order, matchParams),
        exchangeKind: ExchangeKind.ELEMENT,
        maker: order.params.maker,
      };
    } else if (kind === "rarible") {
      order = order as Sdk.Rarible.Order;

      const exchange = new Sdk.Rarible.Exchange(this.chainId);
      return {
        tx: await exchange.fillOrderTx(taker, order, {
          assetClass: contractKind,
          tokenId,
          amount: Number(amount) ?? 1,
        }),
        exchangeKind: ExchangeKind.RARIBLE,
        maker: order.params.maker,
      };
    }

    throw new Error("Unreachable");
  }

  private async generateNativeBidFillTx(
    { kind, order, tokenId, extraArgs }: BidDetails,
    taker: string,
    options?: {
      source?: string;
    }
  ): Promise<{ tx: TxData; exchangeKind: ExchangeKind }> {
    // When filling through the router, in all below cases we set
    // the router contract as the taker since forwarding received
    // tokens to the actual taker of the order will be taken care
    // of on-chain by the router.

    const filler = this.contract.address;

    if (kind === "looks-rare") {
      order = order as Sdk.LooksRare.Order;

      const matchParams = order.buildMatching(filler, {
        tokenId,
        ...(extraArgs || {}),
      });

      const exchange = new Sdk.LooksRare.Exchange(this.chainId);
      return {
        tx: exchange.fillOrderTx(filler, order, matchParams),
        exchangeKind: ExchangeKind.LOOKS_RARE,
      };
    } else if (kind === "zeroex-v4") {
      order = order as Sdk.ZeroExV4.Order;

      const matchParams = order.buildMatching({
        tokenId,
        amount: 1,
        // Do not unwrap in order to be compatible with the router
        unwrapNativeToken: false,
      });

      const exchange = new Sdk.ZeroExV4.Exchange(this.chainId);
      return {
        tx: await exchange.fillOrderTx(filler, order, matchParams, {
          // Do not use the `onReceived` hook filling to be compatible with the router
          noDirectTransfer: true,
        }),
        exchangeKind: ExchangeKind.ZEROEX_V4,
      };
    } else if (kind === "seaport") {
      order = order as Sdk.Seaport.Order;

      const matchParams = order.buildMatching({
        tokenId,
        ...(extraArgs || {}),
        amount: 1,
      });

      const exchange = new Sdk.Seaport.Exchange(this.chainId);
      return {
        tx: await exchange.fillOrderTx(
          filler,
          order,
          matchParams,
          // Force using `fulfillAdvancedOrder` to pass router selector whitelist
          {
            recipient: filler,
          }
        ),
        exchangeKind: ExchangeKind.SEAPORT,
      };
    } else if (kind === "seaport-partial") {
      order = order as Sdk.Seaport.Types.PartialOrder;
      const result = await axios.get(
        `https://order-fetcher.vercel.app/api/offer?orderHash=${order.id}&contract=${order.contract}&tokenId=${order.tokenId}&taker=${taker}&chainId=${this.chainId}`
      );

      const fullOrder = new Sdk.Seaport.Order(this.chainId, result.data.order);

      const exchange = new Sdk.Seaport.Exchange(this.chainId);
      return {
        tx: await exchange.fillOrderTx(
          filler,
          fullOrder,
          {
            criteriaResolvers: result.data.criteriaResolvers ?? [],
          },
          // Force using `fulfillAdvancedOrder` to pass router selector whitelist
          {
            recipient: filler,
          }
        ),
        exchangeKind: ExchangeKind.SEAPORT,
      };
    } else if (kind === "x2y2") {
      order = order as Sdk.X2Y2.Order;

      const exchange = new Sdk.X2Y2.Exchange(
        this.chainId,
        String(this.options?.x2y2ApiKey)
      );
      return {
        tx: await exchange.fillOrderTx(taker, order, {
          tokenId,
          source: options?.source,
        }),
        exchangeKind: ExchangeKind.X2Y2,
      };
    } else if (kind === "sudoswap") {
      order = order as Sdk.Sudoswap.Order;

      const router = new Sdk.Sudoswap.Router(this.chainId);
      return {
        tx: router.fillBuyOrderTx(taker, order, tokenId),
        exchangeKind: ExchangeKind.SUDOSWAP,
      };
    } else if (kind === "element") {
      order = order as Sdk.Element.Order;

      const matchParams = order.buildMatching({
        tokenId,
        amount: 1,
        // Do not unwrap in order to be compatible with the router
        unwrapNativeToken: false,
      });

      const exchange = new Sdk.Element.Exchange(this.chainId);
      return {
        tx: exchange.fillOrderTx(filler, order, matchParams, {
          // Do not use the `onReceived` hook filling to be compatible with the router
          noDirectTransfer: true,
        }),
        exchangeKind: ExchangeKind.ELEMENT,
      };
    }

    throw new Error("Unreachable");
  }
}
