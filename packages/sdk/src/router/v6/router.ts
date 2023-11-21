import { Interface } from "@ethersproject/abi";
import { Provider } from "@ethersproject/abstract-provider";
import { AddressZero, HashZero } from "@ethersproject/constants";
import { Contract } from "@ethersproject/contracts";
import axios from "axios";

// Needed for `collectionxyz`
import { TokenIDs } from "fummpel";
// Needed for `rarible`
import { encodeForMatchOrders } from "../../rarible/utils";
// Needed for `seaport`
import { ConduitController } from "../../seaport-base";
import { constructOfferCounterOrderAndFulfillments } from "../../seaport-base/helpers";

import * as Sdk from "../../index";
import { TxData, bn, generateSourceBytes, getErrorMessage, uniqBy } from "../../utils";
import * as Addresses from "./addresses";
import * as ApprovalProxy from "./approval-proxy";
import { PermitHandler } from "./permit";
import {
  BidDetails,
  ExecutionInfo,
  FTApproval,
  Fee,
  FillBidsResult,
  FillListingsResult,
  FillMintsResult,
  ListingDetails,
  MintDetails,
  NFTApproval,
  PerCurrencyListingDetails,
  PerPoolSwapDetails,
  PreSignature,
  SwapDetail,
  TransfersResult,
  TxTags,
} from "./types";
import { SwapInfo, generateSwapInfo, mergeSwapInfos } from "./swap/index";
import { generateFTApprovalTxData, generateNFTApprovalTxData, isETH, isWETH } from "./utils";

// Tokens
import ERC721Abi from "../../common/abis/Erc721.json";
import ERC1155Abi from "../../common/abis/Erc1155.json";
// Router
import RouterAbi from "./abis/ReservoirV6_0_1.json";
// Misc
import ApprovalProxyAbi from "./abis/ApprovalProxy.json";
import OpenseaTransferHelperAbi from "./abis/OpenseaTransferHelper.json";
// Modules
import CollectionXyzModuleAbi from "./abis/CollectionXyzModule.json";
import DittoModuleAbi from "./abis/DittoModule.json";
import ElementModuleAbi from "./abis/ElementModule.json";
import FoundationModuleAbi from "./abis/FoundationModule.json";
import LooksRareV2ModuleAbi from "./abis/LooksRareV2Module.json";
import NFTXModuleAbi from "./abis/NFTXModule.json";
import NFTXZeroExModuleAbi from "./abis/NFTXZeroExModule.json";
import RaribleModuleAbi from "./abis/RaribleModule.json";
import SeaportModuleAbi from "./abis/SeaportModule.json";
import SeaportV14ModuleAbi from "./abis/SeaportV14Module.json";
import SeaportV15ModuleAbi from "./abis/SeaportV15Module.json";
import AlienswapModuleAbi from "./abis/AlienswapModule.json";
import SudoswapModuleAbi from "./abis/SudoswapModule.json";
import SuperRareModuleAbi from "./abis/SuperRareModule.json";
import SwapModuleAbi from "./abis/SwapModule.json";
import OneInchSwapModuleAbi from "./abis/OneInchSwapModule.json";
import X2Y2ModuleAbi from "./abis/X2Y2Module.json";
import ZeroExV4ModuleAbi from "./abis/ZeroExV4Module.json";
import ZoraModuleAbi from "./abis/ZoraModule.json";
import PermitProxyAbi from "./abis/PermitProxy.json";
import SudoswapV2ModuleAbi from "./abis/SudoswapV2Module.json";
import MidaswapModuleAbi from "./abis/MidaswapModule.json";
import CaviarV1ModuleAbi from "./abis/CaviarV1Module.json";
import CryptoPunksModuleAbi from "./abis/CryptoPunksModule.json";
import PaymentProcessorModuleAbi from "./abis/PaymentProcessorModule.json";
import MintModuleAbi from "./abis/MintModule.json";
import MintProxyAbi from "./abis/MintProxy.json";
// Exchanges
import SeaportV15Abi from "../../seaport-v1.5/abis/Exchange.json";

type SetupOptions = {
  x2y2ApiKey?: string;
  openseaApiKey?: string;
  cbApiKey?: string;
  orderFetcherBaseUrl?: string;
  orderFetcherMetadata?: object;
};

export class Router {
  public chainId: number;
  public provider: Provider;
  public options?: SetupOptions;

  public contracts: { [name: string]: Contract };

  constructor(chainId: number, provider: Provider, options?: SetupOptions) {
    this.chainId = chainId;
    this.provider = provider;
    this.options = options;

    this.contracts = {
      // Initialize router
      router: new Contract(Addresses.Router[chainId] ?? AddressZero, RouterAbi, provider),
      // Initialize approval proxy
      approvalProxy: new Contract(
        Addresses.ApprovalProxy[chainId] ?? AddressZero,
        ApprovalProxyAbi,
        provider
      ),
      // Initialize modules
      collectionXyzModule: new Contract(
        Addresses.CollectionXyzModule[chainId] ?? AddressZero,
        CollectionXyzModuleAbi,
        provider
      ),
      dittoModule: new Contract(
        Addresses.DittoModule[chainId] ?? AddressZero,
        DittoModuleAbi,
        provider
      ),
      elementModule: new Contract(
        Addresses.ElementModule[chainId] ?? AddressZero,
        ElementModuleAbi,
        provider
      ),
      foundationModule: new Contract(
        Addresses.FoundationModule[chainId] ?? AddressZero,
        FoundationModuleAbi,
        provider
      ),
      looksRareV2Module: new Contract(
        Addresses.LooksRareV2Module[chainId] ?? AddressZero,
        LooksRareV2ModuleAbi,
        provider
      ),
      seaportModule: new Contract(
        Addresses.SeaportModule[chainId] ?? AddressZero,
        SeaportModuleAbi,
        provider
      ),
      seaportV14Module: new Contract(
        Addresses.SeaportV14Module[chainId] ?? AddressZero,
        SeaportV14ModuleAbi,
        provider
      ),
      seaportV15Module: new Contract(
        Addresses.SeaportV15Module[chainId] ?? AddressZero,
        SeaportV15ModuleAbi,
        provider
      ),
      sudoswapModule: new Contract(
        Addresses.SudoswapModule[chainId] ?? AddressZero,
        SudoswapModuleAbi,
        provider
      ),
      sudoswapV2Module: new Contract(
        Addresses.SudoswapV2Module[chainId] ?? AddressZero,
        SudoswapV2ModuleAbi,
        provider
      ),
      midaswapModule: new Contract(
        Addresses.MidaswapModule[chainId] ?? AddressZero,
        MidaswapModuleAbi
      ),
      caviarV1Module: new Contract(
        Addresses.CaviarV1Module[chainId] ?? AddressZero,
        CaviarV1ModuleAbi,
        provider
      ),
      superRareModule: new Contract(
        Addresses.SuperRareModule[chainId] ?? AddressZero,
        SuperRareModuleAbi,
        provider
      ),
      x2y2Module: new Contract(
        Addresses.X2Y2Module[chainId] ?? AddressZero,
        X2Y2ModuleAbi,
        provider
      ),
      zeroExV4Module: new Contract(
        Addresses.ZeroExV4Module[chainId] ?? AddressZero,
        ZeroExV4ModuleAbi,
        provider
      ),
      zoraModule: new Contract(
        Addresses.ZoraModule[chainId] ?? AddressZero,
        ZoraModuleAbi,
        provider
      ),
      nftxModule: new Contract(
        Addresses.NFTXModule[chainId] ?? AddressZero,
        NFTXModuleAbi,
        provider
      ),
      nftxZeroExModule: new Contract(
        Addresses.NFTXZeroExModule[chainId] ?? AddressZero,
        NFTXZeroExModuleAbi,
        provider
      ),
      raribleModule: new Contract(
        Addresses.RaribleModule[chainId] ?? AddressZero,
        RaribleModuleAbi,
        provider
      ),
      swapModule: new Contract(
        Addresses.SwapModule[chainId] ?? AddressZero,
        SwapModuleAbi,
        provider
      ),
      oneInchSwapModule: new Contract(
        Addresses.OneInchSwapModule[chainId] ?? AddressZero,
        OneInchSwapModuleAbi,
        provider
      ),
      alienswapModule: new Contract(
        Addresses.AlienswapModule[chainId] ?? AddressZero,
        AlienswapModuleAbi,
        provider
      ),
      cryptoPunksModule: new Contract(
        Addresses.CryptoPunksModule[chainId] ?? AddressZero,
        CryptoPunksModuleAbi,
        provider
      ),
      paymentProcessorModule: new Contract(
        Addresses.PaymentProcessorModule[chainId] ?? AddressZero,
        PaymentProcessorModuleAbi,
        provider
      ),
      permitProxy: new Contract(
        Addresses.PermitProxy[chainId] ?? AddressZero,
        PermitProxyAbi,
        provider
      ),
      mintModule: new Contract(
        Addresses.MintModule[chainId] ?? AddressZero,
        MintModuleAbi,
        provider
      ),
    };
  }

  public async fillMintsTx(
    details: MintDetails[],
    taker: string,
    options?: {
      source?: string;
      // Skip any errors (either off-chain or on-chain)
      partial?: boolean;
      // Force direct filling
      forceDirectFilling?: boolean;
      // Wallet used for relaying the fill transaction
      relayer?: string;
    }
  ): Promise<FillMintsResult> {
    const txs: FillMintsResult["txs"][0][] = [];
    const success: { [orderId: string]: boolean } = {};

    const sender = options?.relayer ?? taker;

    if (
      !Addresses.MintModule[this.chainId] ||
      options?.forceDirectFilling ||
      (details.length === 1 && !details[0].fees?.length && !details[0].comment && !options?.relayer)
    ) {
      // Under some conditions, we simply return that transaction data back to the caller

      for (const { txData, orderId } of details) {
        txs.push({
          txData: {
            ...txData,
            from: sender,
            data: txData.data + generateSourceBytes(options?.source),
          },
          txTags: {
            mints: 1,
          },
          orderIds: [orderId],
        });

        success[orderId] = true;
      }
    } else {
      // Otherwise, we wrap the mint transactions within a router execution

      const proxyCalldata = new Interface(MintProxyAbi).encodeFunctionData("mintMultiple", [
        details.map((d) => ({
          to: d.txData.to,
          data: d.txData.data,
          value: d.txData.value ?? 0,
          fees: d.fees ?? [],
          token: d.token,
          quantity: d.quantity,
          comment: d.comment ?? "",
        })),
        {
          refundTo: sender,
          revertIfIncomplete: Boolean(!options?.partial),
        },
      ]);
      const moduleCalldata = this.contracts.mintModule.interface.encodeFunctionData("mint", [
        taker,
        proxyCalldata,
      ]);

      const value = details
        .map((d) =>
          bn(d.txData.value ?? 0).add(
            d.fees?.length ? d.fees.map((f) => bn(f.amount)).reduce((a, b) => a.add(b)) : 0
          )
        )
        .reduce((a, b) => a.add(b), bn(0))
        .toHexString();
      txs.push({
        txData: {
          from: sender,
          to: this.contracts.router.address,
          data:
            this.contracts.router.interface.encodeFunctionData("execute", [
              [
                {
                  module: this.contracts.mintModule.address,
                  data: moduleCalldata,
                  value,
                },
              ],
            ]) + generateSourceBytes(options?.source),
          value,
        },
        txTags: {
          mints: details.length,
        },
        orderIds: details.map((d) => d.orderId),
      });

      for (const { orderId } of details) {
        success[orderId] = true;
      }
    }

    return { txs, success };
  }

  public async fillListingsTx(
    details: ListingDetails[],
    taker: string,
    buyInCurrency = Sdk.Common.Addresses.Native[this.chainId],
    options?: {
      source?: string;
      // Force filling through the router (where possible)
      forceRouter?: boolean;
      // Skip any errors (either off-chain or on-chain)
      partial?: boolean;
      // Wallet used for relaying the fill transaction
      relayer?: string;
      // Needed for filling Blur orders
      blurAuth?: {
        accessToken: string;
      };
      // Use permit instead of approvals (only works for USDC)
      usePermit?: boolean;
      swapProvider?: "uniswap" | "1inch";
      // Callback for handling errors
      onError?: (
        kind: string,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        error: any,
        data: {
          orderId: string;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          additionalInfo: any;
          isUnrecoverable?: boolean;
        }
      ) => Promise<void>;
    }
  ): Promise<FillListingsResult> {
    // Assume the listing details are consistent with the underlying order object
    let txs: FillListingsResult["txs"][0][] = [];
    const success: { [orderId: string]: boolean } = {};

    // Keep track of any swaps that need to be executed
    const swapDetails: SwapDetail[] = [];

    // When filling a single order in partial mode, propagate any errors back directly
    if (options?.partial && details.length === 1) {
      options.partial = false;
    }

    const getFees = (ownDetails: ListingDetails[]) =>
      // TODO: Should not split the local fees among all executions
      ownDetails
        .flatMap(({ fees }) => fees ?? [])
        .filter(
          ({ amount, recipient }) =>
            // Skip zero amounts and/or recipients
            bn(amount).gt(0) && recipient !== AddressZero
        );

    // We don't have a module for Manifold listings
    if (details.some(({ kind }) => kind === "manifold")) {
      if (options?.relayer) {
        throw new Error("Relayer not supported for Manifold orders");
      }

      for (const detail of details.filter(({ kind }) => kind === "manifold")) {
        const order = detail.order as Sdk.Manifold.Order;
        const exchange = new Sdk.Manifold.Exchange(this.chainId);

        const amountFilled = Number(detail.amount) ?? 1;
        const orderPrice = bn(order.params.details.initialAmount).mul(amountFilled).toString();

        if (buyInCurrency !== Sdk.Common.Addresses.Native[this.chainId]) {
          swapDetails.push({
            tokenIn: buyInCurrency,
            tokenOut: Sdk.Common.Addresses.Native[this.chainId],
            tokenOutAmount: orderPrice,
            recipient: taker,
            refundTo: taker,
            details: [detail],
            txIndex: txs.length,
          });
        }

        txs.push({
          approvals: [],
          permits: [],
          preSignatures: [],
          txTags: {
            listings: { manifold: 1 },
          },
          txData: exchange.fillOrderTx(
            taker,
            Number(order.params.id),
            amountFilled,
            orderPrice,
            options
          ),
          orderIds: [detail.orderId],
        });

        success[detail.orderId] = true;
      }
    }

    // We don't have a module for PaymentProcessorV2 listings
    if (details.some(({ kind }) => kind === "payment-processor-v2")) {
      const ppv2Details = details.filter(({ kind }) => kind === "payment-processor-v2");

      const exchange = new Sdk.PaymentProcessorV2.Exchange(this.chainId);
      const operator = exchange.contract.address;

      const allFees = ppv2Details.map((c) => getFees([c]));

      const orders: Sdk.PaymentProcessorV2.Order[] = ppv2Details.map(
        (c) => c.order as Sdk.PaymentProcessorV2.Order
      );

      const useSweepCollection =
        ppv2Details.length > 1 &&
        ppv2Details.every((c) => c.contract === details[0].contract) &&
        ppv2Details.every((c) => c.currency === details[0].currency) &&
        ppv2Details.every((c) => (c.fees ? c.fees.length === 0 : true)) &&
        orders.every((c) => !c.isPartial());

      for (const detail of ppv2Details) {
        const order = detail.order as Sdk.PaymentProcessorV2.Order;
        if (buyInCurrency !== Sdk.Common.Addresses.Native[this.chainId]) {
          swapDetails.push({
            tokenIn: buyInCurrency,
            tokenOut: Sdk.Common.Addresses.Native[this.chainId],
            tokenOutAmount: order.params.itemPrice,
            recipient: taker,
            refundTo: taker,
            details: [detail],
            txIndex: txs.length,
          });
        }
      }

      const approvals: FTApproval[] = [];
      for (const { currency, price } of ppv2Details) {
        if (!isETH(this.chainId, currency)) {
          approvals.push({
            currency,
            amount: price,
            owner: taker,
            operator,
            txData: generateFTApprovalTxData(currency, taker, operator),
          });
        }
      }
      if (useSweepCollection) {
        txs.push({
          approvals,
          permits: [],
          txTags: {
            listings: { "payment-processor-v2": orders.length },
          },
          preSignatures: [],
          txData: exchange.sweepCollectionTx(taker, orders, {
            source: options?.source,
            fee: allFees[0][0],
            relayer: options?.relayer,
          }),
          orderIds: ppv2Details.map((d) => d.orderId),
        });
      } else {
        txs.push({
          approvals,
          permits: [],
          txTags: {
            listings: { "payment-processor-v2": orders.length },
          },
          preSignatures: [],
          txData: exchange.fillOrdersTx(
            taker,
            orders,
            orders.map((_, i) => {
              return {
                taker,
                amount: ppv2Details[i].amount ?? 1,
              };
            }),
            {
              source: options?.source,
              fees: allFees.map((c) => c[0]),
              relayer: options?.relayer,
            }
          ),
          orderIds: ppv2Details.map((d) => d.orderId),
        });
      }

      for (const { orderId } of ppv2Details) {
        success[orderId] = true;
      }
    }

    // Detect which contracts block SCs via PaymentProcessor
    const blockedPaymentProcessorDetails: ListingDetails[] = [];
    await Promise.all(
      details
        .filter((d) => d.kind === "payment-processor")
        .map(async (d) => {
          const exchange = new Sdk.PaymentProcessor.Exchange(this.chainId);

          const module = Sdk.RouterV6.Addresses.PaymentProcessorModule[this.chainId];
          if (module) {
            try {
              // Ensure transferring via the module is allowed
              const isAllowed = await exchange.isTransferAllowed(
                this.provider,
                d.contract,
                module,
                module,
                exchange.contract.address
              );
              if (!isAllowed) {
                blockedPaymentProcessorDetails.push(d);
              }
            } catch {
              blockedPaymentProcessorDetails.push(d);
            }
          }
        })
    );

    // Fill directly PaymentProcessor listings for which SCs are blocked
    if (blockedPaymentProcessorDetails.length) {
      if (options?.relayer) {
        throw new Error("Relayer not supported for PaymentProcessor orders");
      }

      const exchange = new Sdk.PaymentProcessor.Exchange(this.chainId);
      const operator = exchange.contract.address;

      for (const d of blockedPaymentProcessorDetails) {
        if (buyInCurrency !== d.currency) {
          swapDetails.push({
            tokenIn: buyInCurrency,
            tokenOut: d.currency,
            tokenOutAmount: d.price,
            recipient: taker,
            refundTo: taker,
            details: [d],
            txIndex: txs.length,
          });
        }
      }

      const approvals: FTApproval[] = [];
      for (const { currency, price } of blockedPaymentProcessorDetails) {
        if (!isETH(this.chainId, currency)) {
          approvals.push({
            currency,
            amount: price,
            owner: taker,
            operator,
            txData: generateFTApprovalTxData(currency, taker, operator),
          });
        }
      }

      const preSignatures: PreSignature[] = [];
      const orders: Sdk.PaymentProcessor.Order[] = blockedPaymentProcessorDetails.map(
        (c) => c.order as Sdk.PaymentProcessor.Order
      );

      // Use the gas-efficient sweep method when:
      // - there is at least one listing
      // - all listings are for the same collection
      // - all listings have the same payment token
      const useSweepCollection =
        blockedPaymentProcessorDetails.length > 1 &&
        blockedPaymentProcessorDetails.every((c) => c.contract === details[0].contract) &&
        blockedPaymentProcessorDetails.every((c) => c.currency === details[0].currency);

      if (useSweepCollection) {
        const bundledOrder = Sdk.PaymentProcessor.Order.createBundledOfferOrder(orders, {
          taker,
          takerMasterNonce: await exchange.getMasterNonce(this.provider, taker),
        });

        const signData = bundledOrder.getSignatureData();
        preSignatures.push({
          kind: "payment-processor-take-order",
          signer: taker,
          data: signData,
          uniqueId: `${bundledOrder.params.tokenAddress}-${bundledOrder.params.tokenIds?.join(
            "-"
          )}-${bundledOrder.params.price}`,
        });

        txs.push({
          approvals,
          permits: [],
          txTags: {
            listings: { "payment-processor": orders.length },
          },
          preSignatures: preSignatures,
          txData: exchange.sweepCollectionTx(taker, bundledOrder, orders, options),
          orderIds: blockedPaymentProcessorDetails.map((d) => d.orderId),
        });
      } else {
        const takeOrders: Sdk.PaymentProcessor.Order[] = [];
        for (const order of orders) {
          const takerOrder = order.buildMatching({
            taker,
            takerMasterNonce: await exchange.getMasterNonce(this.provider, taker),
          });

          takeOrders.push(takerOrder);

          const signData = takerOrder.getSignatureData();
          preSignatures.push({
            kind: "payment-processor-take-order",
            signer: taker,
            data: signData,
            uniqueId: `${takerOrder.params.tokenAddress}-${takerOrder.params.tokenId}-${takerOrder.params.price}`,
          });
        }

        txs.push({
          approvals,
          permits: [],
          txTags: {
            listings: { "payment-processor": orders.length },
          },
          preSignatures: preSignatures,
          txData: exchange.fillOrdersTx(taker, orders, takeOrders, options),
          orderIds: blockedPaymentProcessorDetails.map((d) => d.orderId),
        });
      }

      for (const { orderId } of blockedPaymentProcessorDetails) {
        success[orderId] = true;
      }
    }

    // Filling Blur listings is extremely tricky since they explicitly designed
    // their contracts so that it is not possible to fill indirectly (eg. via a
    // router contract). Given these restriction, we might need to use multiple
    // transactions: one for BLUR / OS / LR / X2Y2 orders (what Blur supports),
    // and another one for the rest of the orders (which Blur doesn't support).
    // For orders that Blur supports we use the calldata fetched from their API
    // while for the others we generate the calldata by ourselves. This is only
    // relevant if the orders to fill include a Blur order.

    // Extract any Blur-compatible listings
    const blurCompatibleListings: ListingDetails[] = [];
    if (details.find((d) => d.source === "blur.io")) {
      if (options?.relayer) {
        throw new Error("Relayer not supported when filling Blur orders");
      }

      for (let i = 0; i < details.length; i++) {
        const detail = details[i];
        if (
          detail.contractKind === "erc721" &&
          ["blur.io", "opensea.io"].includes(detail.source!)
        ) {
          blurCompatibleListings.push(detail);
        }
      }
    }

    // Generate calldata for the above Blur-compatible listings
    if (blurCompatibleListings.length) {
      try {
        // We'll have one transaction per contract
        const result: {
          [contract: string]: {
            from: string;
            to: string;
            data: string;
            value: string;
            path: { contract: string; tokenId: string }[];
            errors: { tokenId: string; reason: string }[];
          };
        } = await axios
          .post(`${this.options?.orderFetcherBaseUrl}/api/blur-listing`, {
            taker,
            tokens: blurCompatibleListings.map((d) => ({
              contract: d.contract,
              tokenId: d.tokenId,
              price: d.price,
              isFlagged: d.isFlagged,
            })),
            authToken: options?.blurAuth?.accessToken,
            metadata: this.options?.orderFetcherMetadata,
          })
          .then((response) => response.data.calldata);

        for (const [contract, data] of Object.entries(result)) {
          const successfulBlurCompatibleListings: ListingDetails[] = [];
          for (const { tokenId } of data.path) {
            const listing = blurCompatibleListings.find(
              (d) => d.contract === contract && d.tokenId === tokenId
            );
            if (listing) {
              successfulBlurCompatibleListings.push(listing);
            }
          }

          // Expose errors
          for (const { tokenId, reason } of data.errors) {
            if (options?.onError) {
              const listing = blurCompatibleListings.find(
                (d) => d.contract === contract && d.tokenId === tokenId
              );
              if (listing) {
                await options.onError("order-fetcher-blur-listings", new Error(reason), {
                  isUnrecoverable:
                    listing.kind === "blur" &&
                    reason === "ListingNotFound" &&
                    listing.tokenId === tokenId
                      ? true
                      : false,
                  orderId: listing.orderId,
                  additionalInfo: { detail: listing, taker },
                });
              }
            }
          }

          // If we have at least one Blur listing, we should go ahead with the calldata returned by Blur
          if (successfulBlurCompatibleListings.find((d) => d.source === "blur.io")) {
            // Mark the orders handled by Blur as successful
            const orderIds: string[] = [];
            for (const d of successfulBlurCompatibleListings) {
              if (buyInCurrency !== d.currency) {
                swapDetails.push({
                  tokenIn: buyInCurrency,
                  tokenOut: d.currency,
                  tokenOutAmount: d.price,
                  recipient: taker,
                  refundTo: taker,
                  details: [d],
                  txIndex: txs.length,
                });
              }

              success[d.orderId] = true;
              orderIds.push(d.orderId);
            }

            txs.push({
              approvals: [],
              permits: [],
              preSignatures: [],
              txTags: {
                listings: { blur: orderIds.length },
              },
              txData: {
                from: data.from,
                to: data.to,
                data: data.data + generateSourceBytes(options?.source),
                value: data.value,
              },
              orderIds,
            });
          }
        }
      } catch (error) {
        if (options?.onError) {
          for (const detail of details) {
            if (detail.source === "blur.io" && !success[detail.orderId]) {
              await options.onError("order-fetcher-blur-listings", error, {
                orderId: detail.orderId,
                additionalInfo: { detail, taker },
              });
            }
          }
        }

        if (!options?.partial) {
          throw new Error(getErrorMessage(error));
        }
      }
    }

    // Check if we still have any Blur listings for which we didn't properly generate calldata
    if (details.find((d) => d.source === "blur.io" && !success[d.orderId])) {
      if (!options?.partial) {
        throw new Error("Could not fetch calldata for all Blur listings");
      }
    }

    // Handle partial seaport orders:
    // - fetch the full order data for each partial order (concurrently)
    // - remove any partial order from the details

    await Promise.all(
      details.map(async (detail, i) => {
        if (["seaport-v1.5-partial"].includes(detail.kind)) {
          const protocolVersion = "v1.5";
          const order = detail.order as Sdk.SeaportBase.Types.OpenseaPartialOrder;

          try {
            const result = await axios.post(`${this.options?.orderFetcherBaseUrl}/api/listing`, {
              contract: detail.contract,
              tokenId: detail.tokenId,
              unitPrice: order.unitPrice,
              orderHash: order.id,
              taker,
              chainId: this.chainId,
              protocolVersion,
              openseaApiKey: this.options?.openseaApiKey,
              metadata: this.options?.orderFetcherMetadata,
            });

            // Override the details
            details[i] = {
              ...detail,
              kind: "seaport-v1.5",
              order: new Sdk.SeaportV15.Order(this.chainId, result.data.order),
            };
          } catch (error) {
            if (options?.onError) {
              options.onError("order-fetcher-opensea-listing", error, {
                orderId: detail.orderId,
                additionalInfo: {
                  detail,
                  taker,
                },
              });
            }

            if (!options?.partial) {
              throw new Error(getErrorMessage(error));
            }
          }
        } else if (["seaport-v1.5-partial-okx"].includes(detail.kind)) {
          const order = detail.order as Sdk.SeaportBase.Types.OkxPartialOrder;

          try {
            const result = await axios.post(
              `${this.options?.orderFetcherBaseUrl}/api/okx-listing`,
              {
                okxOrderId: order.okxId,
                orderHash: order.id,
                taker,
                chainId: this.chainId,
                metadata: this.options?.orderFetcherMetadata,
              }
            );

            // Override the details
            details[i] = {
              ...detail,
              kind: "seaport-v1.5",
              order: new Sdk.SeaportV15.Order(this.chainId, result.data.order),
              extraArgs: {
                ...details[i].extraArgs,
                extraData: result.data.extraData,
              },
            };
          } catch (error) {
            if (options?.onError) {
              options.onError("order-fetcher-okx-listing", error, {
                orderId: detail.orderId,
                additionalInfo: {
                  detail,
                  taker,
                },
              });
            }

            if (!options?.partial) {
              throw new Error(getErrorMessage(error));
            }
          }
        }
      })
    );

    const relayer = options?.relayer ?? taker;

    // Direct filling for:
    // - seaport-1.5
    // - alienswap

    if (
      details.length &&
      details.every(
        ({ kind, fees, currency, order }) =>
          kind === "seaport-v1.5" &&
          buyInCurrency === currency &&
          // All orders must have the same currency
          currency === details[0].currency &&
          // All orders must have the same conduit
          (order as Sdk.SeaportV15.Order).params.conduitKey ===
            (details[0].order as Sdk.SeaportV15.Order).params.conduitKey &&
          !fees?.length
      ) &&
      !options?.forceRouter &&
      !options?.relayer &&
      !options?.usePermit
    ) {
      const exchange = new Sdk.SeaportV15.Exchange(this.chainId);

      const conduitKey = (details[0].order as Sdk.SeaportV15.Order).params.conduitKey;
      const conduit = exchange.deriveConduit(conduitKey);

      let approval: FTApproval | undefined;
      if (!isETH(this.chainId, details[0].currency)) {
        approval = {
          currency: details[0].currency,
          amount: details[0].price,
          owner: taker,
          operator: conduit,
          txData: generateFTApprovalTxData(details[0].currency, taker, conduit),
        };
      }

      if (details.length === 1) {
        const order = details[0].order as Sdk.SeaportV15.Order;
        return {
          txs: [
            {
              approvals: approval ? [approval] : [],
              permits: [],
              preSignatures: [],
              txTags: {
                listings: { "seaport-v1.5": 1 },
              },
              txData: await exchange.fillOrderTx(
                taker,
                order,
                {
                  ...order.buildMatching({ amount: details[0].amount }),
                  extraData: details[0].extraArgs?.extraData,
                },
                {
                  ...options,
                  conduitKey,
                }
              ),
              orderIds: [details[0].orderId],
            },
          ],
          success: { [details[0].orderId]: true },
        };
      } else {
        const orders = details.map((d) => d.order as Sdk.SeaportV15.Order);

        return {
          txs: [
            {
              approvals: approval ? [approval] : [],
              permits: [],
              preSignatures: [],
              txTags: {
                listings: { "seaport-v1.5": details.length },
              },
              txData: await exchange.fillOrdersTx(
                taker,
                orders,
                orders.map((order, i) => ({
                  ...order.buildMatching({ amount: details[i].amount }),
                  extraData: details[i].extraArgs?.extraData,
                })),
                {
                  ...options,
                  conduitKey,
                }
              ),
              orderIds: details.map((d) => d.orderId),
            },
          ],
          success: Object.fromEntries(details.map((d) => [d.orderId, true])),
        };
      }
    }

    if (
      details.length &&
      details.every(
        ({ kind, fees, currency, order }) =>
          kind === "alienswap" &&
          buyInCurrency === currency &&
          // All orders must have the same currency
          currency === details[0].currency &&
          // All orders must have the same conduit
          (order as Sdk.Alienswap.Order).params.conduitKey ===
            (details[0].order as Sdk.Alienswap.Order).params.conduitKey &&
          !fees?.length
      ) &&
      !options?.forceRouter &&
      !options?.relayer &&
      !options?.usePermit
    ) {
      const exchange = new Sdk.Alienswap.Exchange(this.chainId);

      const conduitKey = (details[0].order as Sdk.Alienswap.Order).params.conduitKey;
      const conduit = exchange.deriveConduit(conduitKey);

      let approval: FTApproval | undefined;
      if (!isETH(this.chainId, details[0].currency)) {
        approval = {
          currency: details[0].currency,
          amount: details[0].price,
          owner: taker,
          operator: conduit,
          txData: generateFTApprovalTxData(details[0].currency, taker, conduit),
        };
      }

      if (details.length === 1) {
        const order = details[0].order as Sdk.Alienswap.Order;
        return {
          txs: [
            {
              approvals: approval ? [approval] : [],
              permits: [],
              preSignatures: [],
              txTags: {
                listings: { alienswap: 1 },
              },
              txData: await exchange.fillOrderTx(
                taker,
                order,
                order.buildMatching({ amount: details[0].amount }),
                {
                  ...options,
                  conduitKey,
                }
              ),
              orderIds: [details[0].orderId],
            },
          ],
          success: { [details[0].orderId]: true },
        };
      } else {
        const orders = details.map((d) => d.order as Sdk.Alienswap.Order);

        return {
          txs: [
            {
              approvals: approval ? [approval] : [],
              permits: [],
              preSignatures: [],
              txTags: {
                listings: { alienswap: details.length },
              },
              txData: await exchange.fillOrdersTx(
                taker,
                orders,
                orders.map((order, i) => order.buildMatching({ amount: details[i].amount })),
                {
                  ...options,
                  conduitKey,
                }
              ),
              orderIds: details.map((d) => d.orderId),
            },
          ],
          success: Object.fromEntries(details.map((d) => [d.orderId, true])),
        };
      }
    }

    // Keep track of any approvals that might be needed
    const approvals: FTApproval[] = [];

    // Keep track of any FT transfers that need to be performed
    const ftTransferItems: ApprovalProxy.TransferItem[] = [];

    // Split all listings by their kind
    // Supports ETH listings only
    const dittoDetails: ListingDetails[] = [];
    const elementErc721Details: ListingDetails[] = [];
    const elementErc721V2Details: ListingDetails[] = [];
    const elementErc1155Details: ListingDetails[] = [];
    const foundationDetails: ListingDetails[] = [];
    const looksRareV2Details: ListingDetails[] = [];
    const sudoswapDetails: ListingDetails[] = [];
    const sudoswapV2Details: ListingDetails[] = [];
    const midaswapDetails: ListingDetails[] = [];
    const caviarV1Details: ListingDetails[] = [];
    const collectionXyzDetails: ListingDetails[] = [];
    const x2y2Details: ListingDetails[] = [];
    const zoraDetails: ListingDetails[] = [];
    const nftxDetails: ListingDetails[] = [];
    const raribleDetails: ListingDetails[] = [];
    const superRareDetails: ListingDetails[] = [];
    const cryptoPunksDetails: ListingDetails[] = [];
    // Supports ETH and ERC20 listings
    const zeroexV4Erc721Details: PerCurrencyListingDetails = {};
    const zeroexV4Erc1155Details: PerCurrencyListingDetails = {};
    const paymentProcessorDetails: PerCurrencyListingDetails = {};
    const seaportDetails: PerCurrencyListingDetails = {};
    const seaportV14Details: PerCurrencyListingDetails = {};
    const seaportV15Details: PerCurrencyListingDetails = {};
    const alienswapDetails: PerCurrencyListingDetails = {};

    for (const detail of details) {
      // Skip any listings handled in a previous step
      if (success[detail.orderId]) {
        continue;
      }

      const { kind, contractKind, currency } = detail;

      let detailsRef: ListingDetails[];
      switch (kind) {
        case "element": {
          const order = detail.order as Sdk.Element.Order;
          detailsRef = order.isBatchSignedOrder()
            ? elementErc721V2Details
            : contractKind === "erc721"
            ? elementErc721Details
            : elementErc1155Details;
          break;
        }

        case "collectionxyz":
          detailsRef = collectionXyzDetails;
          break;

        case "ditto":
          detailsRef = dittoDetails;
          break;

        case "foundation":
          detailsRef = foundationDetails;
          break;

        case "looks-rare-v2":
          detailsRef = looksRareV2Details;
          break;

        case "seaport":
          if (!seaportDetails[currency]) {
            seaportDetails[currency] = [];
          }
          detailsRef = seaportDetails[currency];
          break;

        case "seaport-v1.4":
          if (!seaportV14Details[currency]) {
            seaportV14Details[currency] = [];
          }
          detailsRef = seaportV14Details[currency];
          break;

        case "seaport-v1.5":
          if (!seaportV15Details[currency]) {
            seaportV15Details[currency] = [];
          }
          detailsRef = seaportV15Details[currency];
          break;

        case "alienswap":
          if (!alienswapDetails[currency]) {
            alienswapDetails[currency] = [];
          }
          detailsRef = alienswapDetails[currency];
          break;

        case "sudoswap":
          detailsRef = sudoswapDetails;
          break;

        case "sudoswap-v2":
          detailsRef = sudoswapV2Details;
          break;

        case "midaswap":
          detailsRef = midaswapDetails;
          break;

        case "caviar-v1":
          detailsRef = caviarV1Details;
          break;

        case "x2y2":
          detailsRef = x2y2Details;
          break;

        case "zeroex-v4":
          if (contractKind === "erc721") {
            if (!zeroexV4Erc721Details[currency]) {
              zeroexV4Erc721Details[currency] = [];
            }
            detailsRef = zeroexV4Erc721Details[currency];
          } else {
            if (!zeroexV4Erc1155Details[currency]) {
              zeroexV4Erc1155Details[currency] = [];
            }
            detailsRef = zeroexV4Erc1155Details[currency];
          }
          break;

        case "zora":
          detailsRef = zoraDetails;
          break;

        case "nftx": {
          detailsRef = nftxDetails;
          break;
        }

        case "rarible": {
          detailsRef = raribleDetails;
          break;
        }

        case "superrare": {
          detailsRef = superRareDetails;
          break;
        }

        case "cryptopunks": {
          detailsRef = cryptoPunksDetails;
          break;
        }

        case "payment-processor": {
          if (!paymentProcessorDetails[currency]) {
            paymentProcessorDetails[currency] = [];
          }
          detailsRef = paymentProcessorDetails[currency];
          break;
        }

        default:
          continue;
      }

      detailsRef.push(detail);
    }

    // Generate router executions
    let executions: {
      info: ExecutionInfo;
      orderIds: string[];
    }[] = [];

    // Keep track of tags for the router execution
    const routerTxTags: TxTags = {
      listings: {},
      bids: {},
      mints: 0,
      swaps: 0,
      feesOnTop: 0,
    };
    const addRouterTags = (orderKind: string, numListings: number, numFeesOnTop: number) => {
      if (!routerTxTags.listings![orderKind]) {
        routerTxTags.listings![orderKind] = 0;
      }
      routerTxTags.listings![orderKind] += numListings;
      routerTxTags.feesOnTop! += numFeesOnTop;
    };

    // Handle Element ERC721 listings
    if (elementErc721Details.length) {
      const orders = elementErc721Details.map((d) => d.order as Sdk.Element.Order);
      const module = this.contracts.elementModule;

      const fees = getFees(elementErc721Details);
      const price = orders.map((order) => order.getTotalPrice()).reduce((a, b) => a.add(b), bn(0));
      const feeAmount = fees.map(({ amount }) => bn(amount)).reduce((a, b) => a.add(b), bn(0));
      const totalPrice = price.add(feeAmount);

      const listingParams = {
        fillTo: taker,
        refundTo: relayer,
        revertIfIncomplete: Boolean(!options?.partial),
        amount: price,
      };

      executions.push({
        info: {
          module: module.address,
          data:
            orders.length === 1
              ? module.interface.encodeFunctionData("acceptETHListingERC721", [
                  orders[0].getRaw(),
                  orders[0].params,
                  listingParams,
                  fees,
                ])
              : module.interface.encodeFunctionData("acceptETHListingsERC721", [
                  orders.map((order) => order.getRaw()),
                  orders.map((order) => order.params),
                  listingParams,
                  fees,
                ]),
          value: totalPrice,
        },
        orderIds: elementErc721Details.map((d) => d.orderId),
      });

      // Track any possibly required swap
      swapDetails.push({
        tokenIn: buyInCurrency,
        tokenOut: Sdk.Common.Addresses.Native[this.chainId],
        tokenOutAmount: totalPrice,
        recipient: module.address,
        refundTo: relayer,
        details: elementErc721Details,
        executionIndex: executions.length - 1,
      });

      addRouterTags("element", orders.length, fees.length);

      // Mark the listings as successfully handled
      for (const { orderId } of elementErc721Details) {
        success[orderId] = true;
      }
    }

    // Handle Element ERC721 listings V2
    if (elementErc721V2Details.length) {
      const orders = elementErc721V2Details.map((d) => d.order as Sdk.Element.Order);
      const module = this.contracts.elementModule;

      const fees = getFees(elementErc721V2Details);
      const price = orders.map((order) => order.getTotalPrice()).reduce((a, b) => a.add(b), bn(0));
      const feeAmount = fees.map(({ amount }) => bn(amount)).reduce((a, b) => a.add(b), bn(0));
      const totalPrice = price.add(feeAmount);

      const listingParams = {
        fillTo: taker,
        refundTo: relayer,
        revertIfIncomplete: Boolean(!options?.partial),
        amount: price,
      };

      executions.push({
        info: {
          module: module.address,
          data:
            orders.length === 1
              ? module.interface.encodeFunctionData("acceptETHListingERC721V2", [
                  orders[0].getRaw(),
                  listingParams,
                  fees,
                ])
              : module.interface.encodeFunctionData("acceptETHListingsERC721V2", [
                  orders.map((order) => order.getRaw()),
                  listingParams,
                  fees,
                ]),
          value: totalPrice,
        },
        orderIds: elementErc721V2Details.map((d) => d.orderId),
      });

      // Track any possibly required swap
      swapDetails.push({
        tokenIn: buyInCurrency,
        tokenOut: Sdk.Common.Addresses.Native[this.chainId],
        tokenOutAmount: totalPrice,
        recipient: module.address,
        refundTo: relayer,
        details: elementErc721V2Details,
        executionIndex: executions.length - 1,
      });

      addRouterTags("element", orders.length, fees.length);

      // Mark the listings as successfully handled
      for (const { orderId } of elementErc721V2Details) {
        success[orderId] = true;
      }
    }

    // Handle Element ERC1155 listings
    if (elementErc1155Details.length) {
      const orders = elementErc1155Details.map((d) => d.order as Sdk.Element.Order);
      const module = this.contracts.elementModule;

      const fees = getFees(elementErc1155Details);
      const price = orders
        .map((order, i) => order.getTotalPrice(elementErc1155Details[i].amount ?? 1))
        .reduce((a, b) => a.add(b), bn(0));
      const feeAmount = fees.map(({ amount }) => bn(amount)).reduce((a, b) => a.add(b), bn(0));
      const totalPrice = price.add(feeAmount);

      const listingParams = {
        fillTo: taker,
        refundTo: relayer,
        revertIfIncomplete: Boolean(!options?.partial),
        amount: price,
      };

      executions.push({
        info: {
          module: module.address,
          data:
            orders.length === 1
              ? module.interface.encodeFunctionData("acceptETHListingERC1155", [
                  orders[0].getRaw(),
                  orders[0].params,
                  elementErc1155Details[0].amount ?? 1,
                  listingParams,
                  fees,
                ])
              : module.interface.encodeFunctionData("acceptETHListingsERC1155", [
                  orders.map((order) => order.getRaw()),
                  orders.map((order) => order.params),
                  elementErc1155Details.map((d) => d.amount ?? 1),
                  listingParams,
                  fees,
                ]),
          value: totalPrice,
        },
        orderIds: elementErc1155Details.map((d) => d.orderId),
      });

      // Track any possibly required swap
      swapDetails.push({
        tokenIn: buyInCurrency,
        tokenOut: Sdk.Common.Addresses.Native[this.chainId],
        tokenOutAmount: totalPrice,
        recipient: module.address,
        refundTo: relayer,
        details: elementErc1155Details,
        executionIndex: executions.length - 1,
      });

      addRouterTags("element", orders.length, fees.length);

      // Mark the listings as successfully handled
      for (const { orderId } of elementErc1155Details) {
        success[orderId] = true;
      }
    }

    // Handle Foundation listings
    if (foundationDetails.length) {
      const orders = foundationDetails.map((d) => d.order as Sdk.Foundation.Order);
      const module = this.contracts.foundationModule;

      const fees = getFees(foundationDetails);
      const price = orders.map((order) => bn(order.params.price)).reduce((a, b) => a.add(b), bn(0));
      const feeAmount = fees.map(({ amount }) => bn(amount)).reduce((a, b) => a.add(b), bn(0));
      const totalPrice = price.add(feeAmount);

      executions.push({
        info: {
          module: module.address,
          data:
            orders.length === 1
              ? module.interface.encodeFunctionData("acceptETHListing", [
                  {
                    ...orders[0].params,
                    token: orders[0].params.contract,
                  },
                  {
                    fillTo: taker,
                    refundTo: relayer,
                    revertIfIncomplete: Boolean(!options?.partial),
                    amount: price,
                  },
                  fees,
                ])
              : module.interface.encodeFunctionData("acceptETHListings", [
                  orders.map((order) => ({
                    ...order.params,
                    token: order.params.contract,
                  })),
                  {
                    fillTo: taker,
                    refundTo: relayer,
                    revertIfIncomplete: Boolean(!options?.partial),
                    amount: price,
                  },
                  fees,
                ]),
          value: totalPrice,
        },
        orderIds: foundationDetails.map((d) => d.orderId),
      });

      // Track any possibly required swap
      swapDetails.push({
        tokenIn: buyInCurrency,
        tokenOut: Sdk.Common.Addresses.Native[this.chainId],
        tokenOutAmount: totalPrice,
        recipient: this.contracts.foundationModule.address,
        refundTo: relayer,
        details: foundationDetails,
        executionIndex: executions.length - 1,
      });

      addRouterTags("foundation", orders.length, fees.length);

      // Mark the listings as successfully handled
      for (const { orderId } of foundationDetails) {
        success[orderId] = true;
      }
    }

    // Handle LooksRareV2 listings
    if (looksRareV2Details.length) {
      const orders = looksRareV2Details.map((d) => d.order as Sdk.LooksRareV2.Order);
      const module = this.contracts.looksRareV2Module;

      const fees = getFees(looksRareV2Details);
      const price = orders.map((order) => bn(order.params.price)).reduce((a, b) => a.add(b), bn(0));
      const feeAmount = fees.map(({ amount }) => bn(amount)).reduce((a, b) => a.add(b), bn(0));
      const totalPrice = price.add(feeAmount);

      executions.push({
        info: {
          module: module.address,
          data:
            orders.length === 1
              ? module.interface.encodeFunctionData("acceptETHListing", [
                  orders[0].params,
                  orders[0].params.signature!,
                  orders[0].params.merkleTree ?? { root: HashZero, proof: [] },
                  {
                    fillTo: taker,
                    refundTo: relayer,
                    revertIfIncomplete: Boolean(!options?.partial),
                    amount: price,
                  },
                  fees,
                ])
              : module.interface.encodeFunctionData("acceptETHListings", [
                  orders.map((order) => order.params),
                  orders.map((order) => order.params.signature!),
                  orders.map((order) => order.params.merkleTree ?? { root: HashZero, proof: [] }),
                  {
                    fillTo: taker,
                    refundTo: relayer,
                    revertIfIncomplete: Boolean(!options?.partial),
                    amount: price,
                  },
                  fees,
                ]),
          value: totalPrice,
        },
        orderIds: looksRareV2Details.map((d) => d.orderId),
      });

      // Track any possibly required swap
      swapDetails.push({
        tokenIn: buyInCurrency,
        tokenOut: Sdk.Common.Addresses.Native[this.chainId],
        tokenOutAmount: totalPrice,
        recipient: module.address,
        refundTo: relayer,
        details: looksRareV2Details,
        executionIndex: executions.length - 1,
      });

      addRouterTags("looks-rare-v2", orders.length, fees.length);

      // Mark the listings as successfully handled
      for (const { orderId } of looksRareV2Details) {
        success[orderId] = true;
      }
    }

    // Handle Seaport listings
    if (Object.keys(seaportDetails).length) {
      const exchange = new Sdk.SeaportV11.Exchange(this.chainId);
      for (const currency of Object.keys(seaportDetails)) {
        const currencyDetails = seaportDetails[currency];

        const orders = currencyDetails.map((d) => d.order as Sdk.SeaportV11.Order);
        const module = this.contracts.seaportModule;

        const fees = getFees(currencyDetails);
        const price = orders
          .map((order, i) =>
            // Seaport orders can be partially-fillable
            bn(order.getMatchingPrice())
              .mul(currencyDetails[i].amount ?? 1)
              .div(order.getInfo()!.amount)
          )
          .reduce((a, b) => a.add(b), bn(0));
        const feeAmount = fees.map(({ amount }) => bn(amount)).reduce((a, b) => a.add(b), bn(0));
        const totalPrice = price.add(feeAmount);

        const currencyIsETH = isETH(this.chainId, currency);
        const buyInCurrencyIsETH = isETH(this.chainId, buyInCurrency);

        executions.push({
          info: {
            module: module.address,
            data:
              orders.length === 1
                ? module.interface.encodeFunctionData(
                    `accept${currencyIsETH ? "ETH" : "ERC20"}Listing`,
                    [
                      {
                        parameters: {
                          ...orders[0].params,
                          totalOriginalConsiderationItems: orders[0].params.consideration.length,
                        },
                        numerator: currencyDetails[0].amount ?? 1,
                        denominator: orders[0].getInfo()!.amount,
                        signature: orders[0].params.signature,
                        extraData: await exchange.getExtraData(orders[0]),
                      },
                      {
                        fillTo: taker,
                        refundTo: relayer,
                        revertIfIncomplete: Boolean(!options?.partial),
                        amount: price,
                        // Only needed for ERC20 listings
                        token: currency,
                      },
                      fees,
                    ]
                  )
                : module.interface.encodeFunctionData(
                    `accept${currencyIsETH ? "ETH" : "ERC20"}Listings`,
                    [
                      await Promise.all(
                        orders.map(async (order, i) => {
                          const totalAmount = order.getInfo()!.amount;
                          const filledAmount = currencyDetails[i].amount ?? 1;

                          const orderData = {
                            parameters: {
                              ...order.params,
                              totalOriginalConsiderationItems: order.params.consideration.length,
                            },
                            numerator: filledAmount,
                            denominator: totalAmount,
                            signature: order.params.signature,
                            extraData: await exchange.getExtraData(order),
                          };

                          if (currencyIsETH) {
                            return {
                              order: orderData,
                              price: bn(orders[i].getMatchingPrice())
                                .mul(filledAmount)
                                .div(totalAmount),
                            };
                          } else {
                            return orderData;
                          }
                        })
                      ),
                      {
                        fillTo: taker,
                        refundTo: relayer,
                        revertIfIncomplete: Boolean(!options?.partial),
                        amount: price,
                        // Only needed for ERC20 listings
                        token: currency,
                      },
                      fees,
                    ]
                  ),
            value: buyInCurrencyIsETH && currencyIsETH ? totalPrice : 0,
          },
          orderIds: currencyDetails.map((d) => d.orderId),
        });

        // Track any possibly required swap
        swapDetails.push({
          tokenIn: buyInCurrency,
          tokenOut: currency,
          tokenOutAmount: totalPrice,
          recipient: module.address,
          refundTo: relayer,
          details: currencyDetails,
          executionIndex: executions.length - 1,
        });

        addRouterTags("seaport", orders.length, fees.length);

        // Mark the listings as successfully handled
        for (const { orderId } of currencyDetails) {
          success[orderId] = true;
        }
      }
    }

    // Handle Seaport V1.4 listings
    if (Object.keys(seaportV14Details).length) {
      const exchange = new Sdk.SeaportV14.Exchange(this.chainId);
      for (const currency of Object.keys(seaportV14Details)) {
        const currencyDetails = seaportV14Details[currency];

        const orders = currencyDetails.map((d) => d.order as Sdk.SeaportV14.Order);
        const module = this.contracts.seaportV14Module;

        const fees = getFees(currencyDetails);
        const price = orders
          .map((order, i) =>
            // Seaport orders can be partially-fillable
            bn(order.getMatchingPrice())
              .mul(currencyDetails[i].amount ?? 1)
              .div(order.getInfo()!.amount)
          )
          .reduce((a, b) => a.add(b), bn(0));
        const feeAmount = fees.map(({ amount }) => bn(amount)).reduce((a, b) => a.add(b), bn(0));
        const totalPrice = price.add(feeAmount);

        const currencyIsETH = isETH(this.chainId, currency);
        const buyInCurrencyIsETH = isETH(this.chainId, buyInCurrency);

        executions.push({
          info: {
            module: module.address,
            data:
              orders.length === 1
                ? module.interface.encodeFunctionData(
                    `accept${currencyIsETH ? "ETH" : "ERC20"}Listing`,
                    [
                      {
                        parameters: {
                          ...orders[0].params,
                          totalOriginalConsiderationItems: orders[0].params.consideration.length,
                        },
                        numerator: currencyDetails[0].amount ?? 1,
                        denominator: orders[0].getInfo()!.amount,
                        signature: orders[0].params.signature,
                        extraData: await exchange.getExtraData(orders[0], {
                          amount: currencyDetails[0].amount ?? 1,
                        }),
                      },
                      {
                        fillTo: taker,
                        refundTo: relayer,
                        revertIfIncomplete: Boolean(!options?.partial),
                        amount: price,
                        // Only needed for ERC20 listings
                        token: currency,
                      },
                      fees,
                    ]
                  )
                : module.interface.encodeFunctionData(
                    `accept${currencyIsETH ? "ETH" : "ERC20"}Listings`,
                    [
                      await Promise.all(
                        orders.map(async (order, i) => {
                          const totalAmount = order.getInfo()!.amount;
                          const filledAmount = currencyDetails[i].amount ?? 1;

                          const orderData = {
                            parameters: {
                              ...order.params,
                              totalOriginalConsiderationItems: order.params.consideration.length,
                            },
                            numerator: filledAmount,
                            denominator: totalAmount,
                            signature: order.params.signature,
                            extraData: await exchange.getExtraData(orders[0], {
                              amount: filledAmount,
                            }),
                          };

                          if (currencyIsETH) {
                            return {
                              order: orderData,
                              price: bn(orders[i].getMatchingPrice())
                                .mul(filledAmount)
                                .div(totalAmount),
                            };
                          } else {
                            return orderData;
                          }
                        })
                      ),
                      {
                        fillTo: taker,
                        refundTo: relayer,
                        revertIfIncomplete: Boolean(!options?.partial),
                        amount: price,
                        // Only needed for ERC20 listings
                        token: currency,
                      },
                      fees,
                    ]
                  ),
            value: buyInCurrencyIsETH && currencyIsETH ? totalPrice : 0,
          },
          orderIds: currencyDetails.map((d) => d.orderId),
        });

        // Track any possibly required swap
        swapDetails.push({
          tokenIn: buyInCurrency,
          tokenOut: currency,
          tokenOutAmount: totalPrice,
          recipient: module.address,
          refundTo: relayer,
          details: currencyDetails,
          executionIndex: executions.length - 1,
        });

        addRouterTags("seaport-v1.4", orders.length, fees.length);

        // Mark the listings as successfully handled
        for (const { orderId } of currencyDetails) {
          success[orderId] = true;
        }
      }
    }

    // Handle Seaport V1.5 listings
    if (Object.keys(seaportV15Details).length) {
      const exchange = new Sdk.SeaportV15.Exchange(this.chainId);
      for (const currency of Object.keys(seaportV15Details)) {
        const currencyDetails = seaportV15Details[currency];

        const orders = currencyDetails.map((d) => d.order as Sdk.SeaportV15.Order);
        const module = this.contracts.seaportV15Module;

        const fees = getFees(currencyDetails);
        const price = orders
          .map((order, i) =>
            // Seaport orders can be partially-fillable
            bn(order.getMatchingPrice())
              .mul(currencyDetails[i].amount ?? 1)
              .div(order.getInfo()!.amount)
          )
          .reduce((a, b) => a.add(b), bn(0));
        const feeAmount = fees.map(({ amount }) => bn(amount)).reduce((a, b) => a.add(b), bn(0));
        const totalPrice = price.add(feeAmount);

        const currencyIsETH = isETH(this.chainId, currency);
        const buyInCurrencyIsETH = isETH(this.chainId, buyInCurrency);

        executions.push({
          info: {
            module: module.address,
            data:
              orders.length === 1
                ? module.interface.encodeFunctionData(
                    `accept${currencyIsETH ? "ETH" : "ERC20"}Listing`,
                    [
                      {
                        parameters: {
                          ...orders[0].params,
                          totalOriginalConsiderationItems: orders[0].params.consideration.length,
                        },
                        numerator: currencyDetails[0].amount ?? 1,
                        denominator: orders[0].getInfo()!.amount,
                        signature: orders[0].params.signature,
                        extraData: await exchange.getExtraData(orders[0], {
                          amount: currencyDetails[0].amount ?? 1,
                          extraData: currencyDetails[0].extraArgs?.extraData,
                        }),
                      },
                      {
                        fillTo: taker,
                        refundTo: relayer,
                        revertIfIncomplete: Boolean(!options?.partial),
                        amount: price,
                        // Only needed for ERC20 listings
                        token: currency,
                      },
                      fees,
                    ]
                  )
                : module.interface.encodeFunctionData(
                    `accept${currencyIsETH ? "ETH" : "ERC20"}Listings`,
                    [
                      await Promise.all(
                        orders.map(async (order, i) => {
                          const totalAmount = order.getInfo()!.amount;
                          const filledAmount = currencyDetails[i].amount ?? 1;

                          const orderData = {
                            parameters: {
                              ...order.params,
                              totalOriginalConsiderationItems: order.params.consideration.length,
                            },
                            numerator: filledAmount,
                            denominator: totalAmount,
                            signature: order.params.signature,
                            extraData: await exchange.getExtraData(order, {
                              amount: filledAmount,
                              extraData: currencyDetails[i].extraArgs?.extraData,
                            }),
                          };

                          if (currencyIsETH) {
                            return {
                              order: orderData,
                              price: bn(orders[i].getMatchingPrice())
                                .mul(filledAmount)
                                .div(totalAmount),
                            };
                          } else {
                            return orderData;
                          }
                        })
                      ),
                      {
                        fillTo: taker,
                        refundTo: relayer,
                        revertIfIncomplete: Boolean(!options?.partial),
                        amount: price,
                        // Only needed for ERC20 listings
                        token: currency,
                      },
                      fees,
                    ]
                  ),
            value: buyInCurrencyIsETH && currencyIsETH ? totalPrice : 0,
          },
          orderIds: currencyDetails.map((d) => d.orderId),
        });

        // Track any possibly required swap
        swapDetails.push({
          tokenIn: buyInCurrency,
          tokenOut: currency,
          tokenOutAmount: totalPrice,
          recipient: module.address,
          refundTo: relayer,
          details: currencyDetails,
          executionIndex: executions.length - 1,
        });

        addRouterTags("seaport-v1.5", orders.length, fees.length);

        // Mark the listings as successfully handled
        for (const { orderId } of currencyDetails) {
          success[orderId] = true;
        }
      }
    }

    // Handle Alienswap listings
    if (Object.keys(alienswapDetails).length) {
      const exchange = new Sdk.Alienswap.Exchange(this.chainId);
      for (const currency of Object.keys(alienswapDetails)) {
        const currencyDetails = alienswapDetails[currency];

        const orders = currencyDetails.map((d) => d.order as Sdk.Alienswap.Order);
        const module = this.contracts.alienswapModule;

        const fees = getFees(currencyDetails);
        const price = orders
          .map((order, i) =>
            bn(order.getMatchingPrice())
              .mul(currencyDetails[i].amount ?? 1)
              .div(order.getInfo()!.amount)
          )
          .reduce((a, b) => a.add(b), bn(0));
        const feeAmount = fees.map(({ amount }) => bn(amount)).reduce((a, b) => a.add(b), bn(0));
        const totalPrice = price.add(feeAmount);

        const currencyIsETH = isETH(this.chainId, currency);
        const buyInCurrencyIsETH = isETH(this.chainId, buyInCurrency);

        executions.push({
          info: {
            module: module.address,
            data:
              orders.length === 1
                ? module.interface.encodeFunctionData(
                    `accept${currencyIsETH ? "ETH" : "ERC20"}Listing`,
                    [
                      {
                        parameters: {
                          ...orders[0].params,
                          totalOriginalConsiderationItems: orders[0].params.consideration.length,
                        },
                        numerator: currencyDetails[0].amount ?? 1,
                        denominator: orders[0].getInfo()!.amount,
                        signature: orders[0].params.signature,
                        extraData: await exchange.getExtraData(orders[0], {
                          amount: currencyDetails[0].amount ?? 1,
                        }),
                      },
                      {
                        fillTo: taker,
                        refundTo: relayer,
                        revertIfIncomplete: Boolean(!options?.partial),
                        amount: price,
                        // Only needed for ERC20 listings
                        token: currency,
                      },
                      fees,
                    ]
                  )
                : module.interface.encodeFunctionData(
                    `accept${currencyIsETH ? "ETH" : "ERC20"}Listings`,
                    [
                      await Promise.all(
                        orders.map(async (order, i) => {
                          const totalAmount = order.getInfo()!.amount;
                          const filledAmount = currencyDetails[i].amount ?? 1;

                          const orderData = {
                            parameters: {
                              ...order.params,
                              totalOriginalConsiderationItems: order.params.consideration.length,
                            },
                            numerator: filledAmount,
                            denominator: totalAmount,
                            signature: order.params.signature,
                            extraData: await exchange.getExtraData(orders[0], {
                              amount: filledAmount,
                            }),
                          };

                          if (currencyIsETH) {
                            return {
                              order: orderData,
                              price: bn(orders[i].getMatchingPrice())
                                .mul(filledAmount)
                                .div(totalAmount),
                            };
                          } else {
                            return orderData;
                          }
                        })
                      ),
                      {
                        fillTo: taker,
                        refundTo: relayer,
                        revertIfIncomplete: Boolean(!options?.partial),
                        amount: price,
                        // Only needed for ERC20 listings
                        token: currency,
                      },
                      fees,
                    ]
                  ),
            value: buyInCurrencyIsETH && currencyIsETH ? totalPrice : 0,
          },
          orderIds: currencyDetails.map((d) => d.orderId),
        });

        // Track any possibly required swap
        swapDetails.push({
          tokenIn: buyInCurrency,
          tokenOut: currency,
          tokenOutAmount: totalPrice,
          recipient: module.address,
          refundTo: relayer,
          details: currencyDetails,
          executionIndex: executions.length - 1,
        });

        addRouterTags("alienswap", orders.length, fees.length);

        // Mark the listings as successfully handled
        for (const { orderId } of currencyDetails) {
          success[orderId] = true;
        }
      }
    }

    // Handle Collection listings
    if (collectionXyzDetails.length) {
      const ordersAndTokens = collectionXyzDetails.map(
        (d) =>
          ({ order: d.order, tokenId: d.tokenId } as {
            order: Sdk.CollectionXyz.Order;
            tokenId: string;
          })
      );
      const module = this.contracts.collectionXyzModule;

      const fees = getFees(collectionXyzDetails);
      const price = ordersAndTokens
        .map(({ order, tokenId }) =>
          bn(
            order.params.extra.prices[
              // Handle multiple listings from the same pool
              ordersAndTokens
                .filter((ot) => ot.order.params.pool === order.params.pool)
                .findIndex((ot) => ot.tokenId === tokenId)
            ]
          )
        )
        .reduce((a, b) => a.add(b), bn(0));
      const feeAmount = fees.map(({ amount }) => bn(amount)).reduce((a, b) => a.add(b), bn(0));
      const totalPrice = price.add(feeAmount);

      const isERC20 = buyInCurrency !== Sdk.Common.Addresses.Native[this.chainId];
      const functionName = `buyWith${isERC20 ? "ERC20" : "ETH"}`;
      const listingParams = isERC20
        ? {
            fillTo: taker,
            refundTo: relayer,
            revertIfIncomplete: Boolean(!options?.partial),
            token: buyInCurrency,
            amount: price,
          }
        : {
            fillTo: taker,
            refundTo: relayer,
            revertIfIncomplete: Boolean(!options?.partial),
            amount: price,
          };

      executions.push({
        info: {
          module: module.address,
          data: module.interface.encodeFunctionData(functionName, [
            collectionXyzDetails.map((d) => (d.order as Sdk.CollectionXyz.Order).params.pool),
            collectionXyzDetails.map((d) => ({
              nftId: d.tokenId,
              // Unused for buying from pools
              proof: [],
              proofFlags: [],
              externalFilterContext: [],
            })),
            Math.floor(Date.now() / 1000) + 10 * 60,
            listingParams,
            fees,
          ]),
          value: isERC20 ? 0 : totalPrice,
        },
        orderIds: collectionXyzDetails.map((d) => d.orderId),
      });

      // Track any possibly required swap
      swapDetails.push({
        tokenIn: buyInCurrency,
        tokenOut: Sdk.Common.Addresses.Native[this.chainId],
        tokenOutAmount: totalPrice,
        recipient: module.address,
        refundTo: relayer,
        details: collectionXyzDetails,
        executionIndex: executions.length - 1,
      });

      addRouterTags("collectionxyz", ordersAndTokens.length, fees.length);

      // Mark the listings as successfully handled
      for (const { orderId } of collectionXyzDetails) {
        success[orderId] = true;
      }
    }

    // Handle Ditto listings
    if (dittoDetails.length) {
      const orders = dittoDetails.map((d) => d.order as Sdk.Ditto.Order);
      const router = new Sdk.Ditto.Router(this.chainId);
      const module = this.contracts.dittoModule;

      const fees = getFees(dittoDetails);
      const price = orders
        .map((order) => bn(order.params.expectedTokenAmount))
        .reduce((a, b) => a.add(b), bn(0));
      const feeAmount = fees.map(({ amount }) => bn(amount)).reduce((a, b) => a.add(b), bn(0));
      const totalPrice = price.add(feeAmount);

      // Add executions
      for (let i = 0; i < orders.length; i++) {
        executions.push({
          info: {
            module: module.address,
            data: router.fillBuyOrderTx(taker, orders[i]).data,
            value: totalPrice,
          },
          orderIds: [dittoDetails[i].orderId],
        });
      }

      // Track any possibly required swap
      swapDetails.push({
        tokenIn: buyInCurrency,
        tokenOut: Sdk.Common.Addresses.Native[this.chainId],
        tokenOutAmount: totalPrice,
        recipient: module.address,
        refundTo: relayer,
        details: dittoDetails,
        executionIndex: executions.length - 1,
      });

      addRouterTags("ditto", orders.length, fees.length);

      // Mark the listings as successfully handled
      for (const { orderId } of dittoDetails) {
        success[orderId] = true;
      }
    }

    // Handle Sudoswap listings
    if (sudoswapDetails.length) {
      const orders = sudoswapDetails.map((d) => d.order as Sdk.Sudoswap.Order);
      const module = this.contracts.sudoswapModule;

      const fees = getFees(sudoswapDetails);
      const price = orders
        .map((order) =>
          bn(
            order.params.extra.prices[
              // Handle multiple listings from the same pool
              orders
                .filter((o) => o.params.pair === order.params.pair)
                .findIndex((o) => o.params.tokenId === order.params.tokenId)
            ]
          )
        )
        .reduce((a, b) => a.add(b), bn(0));
      const feeAmount = fees.map(({ amount }) => bn(amount)).reduce((a, b) => a.add(b), bn(0));
      const totalPrice = price.add(feeAmount);

      executions.push({
        info: {
          module: module.address,
          data: module.interface.encodeFunctionData("buyWithETH", [
            sudoswapDetails.map((d) => (d.order as Sdk.Sudoswap.Order).params.pair),
            sudoswapDetails.map((d) => d.tokenId),
            Math.floor(Date.now() / 1000) + 10 * 60,
            {
              fillTo: taker,
              refundTo: relayer,
              revertIfIncomplete: Boolean(!options?.partial),
              amount: price,
            },
            fees,
          ]),
          value: totalPrice,
        },
        orderIds: sudoswapDetails.map((d) => d.orderId),
      });

      // Track any possibly required swap
      swapDetails.push({
        tokenIn: buyInCurrency,
        tokenOut: Sdk.Common.Addresses.Native[this.chainId],
        tokenOutAmount: totalPrice,
        recipient: module.address,
        refundTo: relayer,
        details: sudoswapDetails,
        executionIndex: executions.length - 1,
      });

      addRouterTags("sudoswap", orders.length, fees.length);

      // Mark the listings as successfully handled
      for (const { orderId } of sudoswapDetails) {
        success[orderId] = true;
      }
    }

    // Handle Sudoswap V2 listings
    if (sudoswapV2Details.length) {
      const orders = sudoswapV2Details.map((d) => ({
        order: d.order as Sdk.SudoswapV2.Order,
        amount: d.amount,
        contractKind: d.contractKind,
      }));
      const module = this.contracts.sudoswapV2Module;

      const fees = getFees(sudoswapV2Details);
      const price = orders
        .map(({ order, amount, contractKind }) =>
          bn(
            // Handle multiple listings from the same pool
            contractKind === "erc721"
              ? // For ERC721, each order from the same pool gets a different price
                order.params.extra.prices[
                  orders
                    .map(({ order }) => order)
                    .filter((o) => o.params.pair === order.params.pair)
                    .findIndex((o) => o.params.tokenId === order.params.tokenId)
                ]
              : // For ERC1155, each amount from the same pool gets a different price
                order.params.extra.prices
                  .slice(0, Number(amount ?? 1))
                  .reduce((a, b) => a.add(b), bn(0))
          )
        )
        .reduce((a, b) => a.add(b), bn(0));
      const feeAmount = fees.map(({ amount }) => bn(amount)).reduce((a, b) => a.add(b), bn(0));
      const totalPrice = price.add(feeAmount);

      executions.push({
        info: {
          module: module.address,
          data: module.interface.encodeFunctionData("buyWithETH", [
            sudoswapV2Details.map((d) => (d.order as Sdk.SudoswapV2.Order).params.pair),
            sudoswapV2Details.map((d) => (d.contractKind === "erc721" ? d.tokenId : d.amount ?? 1)),
            {
              fillTo: taker,
              refundTo: relayer,
              revertIfIncomplete: Boolean(!options?.partial),
              amount: price,
            },
            fees,
          ]),
          value: totalPrice,
        },
        orderIds: sudoswapV2Details.map((d) => d.orderId),
      });

      // Track any possibly required swap
      swapDetails.push({
        tokenIn: buyInCurrency,
        tokenOut: Sdk.Common.Addresses.Native[this.chainId],
        tokenOutAmount: totalPrice,
        recipient: module.address,
        refundTo: relayer,
        details: sudoswapV2Details,
        executionIndex: executions.length - 1,
      });

      addRouterTags("sudoswap-v2", orders.length, fees.length);

      // Mark the listings as successfully handled
      for (const { orderId } of sudoswapV2Details) {
        success[orderId] = true;
      }
    }

    // Handle Midaswap listings
    if (midaswapDetails.length) {
      const orders = midaswapDetails.map((d) => ({
        order: d.order as Sdk.Midaswap.Order,
        amount: d.amount,
        contractKind: d.contractKind,
      }));
      const module = this.contracts.midaswapModule;

      const fees = getFees(midaswapDetails);

      // Group orders by LP token id
      const lpTokenIdsMap: { [lpTokenId: string]: Sdk.Midaswap.Order[] } = {};
      for (const { order } of orders) {
        if (!lpTokenIdsMap[order.params.lpTokenId]) {
          lpTokenIdsMap[order.params.lpTokenId] = [];
        }
        lpTokenIdsMap[order.params.lpTokenId].push(order);
      }

      // Accumulate
      let price = bn(0);
      Object.keys(lpTokenIdsMap).forEach((lpTokenId) => {
        price = lpTokenIdsMap[lpTokenId][0].params.extra.prices
          .slice(0, lpTokenIdsMap[lpTokenId].length)
          .reduce((a, b) => bn(a).add(bn(b)), bn(0))
          .add(price);
      });
      const feeAmount = fees.map(({ amount }) => bn(amount)).reduce((a, b) => a.add(b), bn(0));
      const totalPrice = price.add(feeAmount);

      executions.push({
        info: {
          module: module.address,
          data: module.interface.encodeFunctionData("buyWithETH", [
            midaswapDetails.map((d) => (d.order as Sdk.Midaswap.Order).params.tokenX),
            midaswapDetails.map((d) => d.tokenId),
            {
              fillTo: taker,
              refundTo: relayer,
              revertIfIncomplete: Boolean(!options?.partial),
              amount: price,
            },
            fees,
          ]),
          value: totalPrice,
        },
        orderIds: midaswapDetails.map((d) => d.orderId),
      });

      // Track any possibly required swap
      swapDetails.push({
        tokenIn: buyInCurrency,
        tokenOut: Sdk.Common.Addresses.Native[this.chainId],
        tokenOutAmount: totalPrice,
        recipient: module.address,
        refundTo: relayer,
        details: midaswapDetails,
        executionIndex: executions.length - 1,
      });

      addRouterTags("midaswap", orders.length, fees.length);

      // Mark the listings as successfully handled
      for (const { orderId } of midaswapDetails) {
        success[orderId] = true;
      }
    }

    // Handle Caviar V1 listings
    if (caviarV1Details.length) {
      const orders = caviarV1Details.map((d) => ({
        order: d.order as Sdk.CaviarV1.Order,
        amount: d.amount,
        contractKind: d.contractKind,
      }));

      const module = this.contracts.caviarV1Module;
      const fees = getFees(caviarV1Details);
      const feeAmount = fees.map(({ amount }) => bn(amount)).reduce((a, b) => a.add(b), bn(0));
      const price = orders
        .map(({ order }) =>
          bn(
            order.params.extra.prices[
              orders
                .map(({ order }) => order)
                .filter((o) => o.params.pool === order.params.pool)
                .findIndex((o) => o.params.tokenId === order.params.tokenId)
            ]
          )
        )
        .reduce((a, b) => a.add(b), bn(0));
      const totalPrice = price.add(feeAmount);

      executions.push({
        info: {
          module: module.address,
          data: module.interface.encodeFunctionData("buyWithETH", [
            caviarV1Details.map((d) => (d.order as Sdk.CaviarV1.Order).params.pool),
            caviarV1Details.map((d) => d.tokenId),
            {
              fillTo: taker,
              refundTo: relayer,
              revertIfIncomplete: Boolean(!options?.partial),
              amount: price,
            },
            fees,
          ]),
          value: totalPrice,
        },
        orderIds: caviarV1Details.map((d) => d.orderId),
      });

      // Track any possibly required swap
      swapDetails.push({
        tokenIn: buyInCurrency,
        tokenOut: Sdk.Common.Addresses.Native[this.chainId],
        tokenOutAmount: totalPrice,
        recipient: module.address,
        refundTo: relayer,
        details: caviarV1Details,
        executionIndex: executions.length - 1,
      });

      addRouterTags("caviar-v1", orders.length, fees.length);

      // Mark the listings as successfully handled
      for (const { orderId } of caviarV1Details) {
        success[orderId] = true;
      }
    }

    // Handle NFTX listings
    if (nftxDetails.length) {
      const module = this.contracts.nftxZeroExModule;

      // Aggregate same-pool orders
      const perPoolOrders: { [pool: string]: Sdk.Nftx.Order[] } = {};
      for (const details of nftxDetails) {
        try {
          const order = details.order as Sdk.Nftx.Order;

          if (!perPoolOrders[order.params.pool]) {
            perPoolOrders[order.params.pool] = [];
          }

          // Attach the ZeroEx calldata
          const index = perPoolOrders[order.params.pool].length;
          const { swapCallData, price } = await order.getQuote(index + 1, 500, this.provider);
          order.params.swapCallData = swapCallData;
          order.params.price = price.toString();

          perPoolOrders[order.params.pool].push(order);
        } catch (error) {
          if (options?.onError) {
            await options.onError("nftx-listing", error, {
              orderId: details.orderId,
              additionalInfo: { detail: details, taker },
            });
          }

          if (!options?.partial) {
            throw new Error(getErrorMessage(error));
          }
        }
      }

      const aggregatedOrders = Object.entries(perPoolOrders).map(([pool, orders]) => ({
        vaultId: perPoolOrders[pool][0].params.vaultId,
        collection: perPoolOrders[pool][0].params.collection,
        specificIds: perPoolOrders[pool].map((o) => o.params.specificIds![0]),
        amount: perPoolOrders[pool].length,
        path: perPoolOrders[pool][0].params.path,
        // Need to use the price and swap calldata of the last order
        swapCallData: perPoolOrders[pool][orders.length - 1].params.swapCallData,
        price: perPoolOrders[pool][orders.length - 1].params.price,
      }));

      // Consider the updated prices (fetched above from 0x)
      const fees = getFees(nftxDetails);
      const price = aggregatedOrders.map((order) => order.price).reduce((a, b) => a.add(b), bn(0));
      const feeAmount = fees.map(({ amount }) => bn(amount)).reduce((a, b) => a.add(b), bn(0));
      const totalPrice = price.add(feeAmount);

      executions.push({
        info: {
          module: module.address,
          data: module.interface.encodeFunctionData("buyWithETH", [
            aggregatedOrders,
            {
              fillTo: taker,
              refundTo: relayer,
              revertIfIncomplete: Boolean(!options?.partial),
              amount: price,
            },
            fees,
          ]),
          value: totalPrice,
        },
        orderIds: nftxDetails.map((d) => d.orderId),
      });

      // Track any possibly required swap
      swapDetails.push({
        tokenIn: buyInCurrency,
        tokenOut: Sdk.Common.Addresses.Native[this.chainId],
        tokenOutAmount: totalPrice,
        recipient: module.address,
        refundTo: relayer,
        details: nftxDetails,
        executionIndex: executions.length - 1,
      });

      addRouterTags("nftx", nftxDetails.length, fees.length);

      // Mark the listings as successfully handled
      for (const { orderId } of nftxDetails) {
        success[orderId] = true;
      }
    }

    // Handle X2Y2 listings
    if (x2y2Details.length) {
      const orders = x2y2Details.map((d) => d.order as Sdk.X2Y2.Order);
      const module = this.contracts.x2y2Module;

      const fees = getFees(x2y2Details);
      // TODO: Only consider successfully-handled orders
      const price = orders.map((order) => bn(order.params.price)).reduce((a, b) => a.add(b), bn(0));
      const feeAmount = fees.map(({ amount }) => bn(amount)).reduce((a, b) => a.add(b), bn(0));
      const totalPrice = price.add(feeAmount);

      const exchange = new Sdk.X2Y2.Exchange(this.chainId, String(this.options?.x2y2ApiKey));
      if (orders.length === 1) {
        try {
          executions.push({
            info: {
              module: module.address,
              data: module.interface.encodeFunctionData("acceptETHListing", [
                // Fetch X2Y2-signed input
                exchange.contract.interface.decodeFunctionData(
                  "run",
                  await exchange.fetchInput(
                    // For X2Y2, the module acts as the taker proxy
                    module.address,
                    orders[0],
                    {
                      source: options?.source,
                      tokenId: x2y2Details[0].tokenId,
                    }
                  )
                ).input,
                {
                  fillTo: taker,
                  refundTo: relayer,
                  revertIfIncomplete: Boolean(!options?.partial),
                  amount: price,
                },
                fees,
              ]),
              value: totalPrice,
            },
            orderIds: [x2y2Details[0].orderId],
          });

          // Track any possibly required swap
          swapDetails.push({
            tokenIn: buyInCurrency,
            tokenOut: Sdk.Common.Addresses.Native[this.chainId],
            tokenOutAmount: totalPrice,
            recipient: module.address,
            refundTo: relayer,
            details: x2y2Details,
            executionIndex: executions.length - 1,
          });

          // Mark the listing as successfully handled
          success[x2y2Details[0].orderId] = true;
        } catch (error) {
          if (options?.onError) {
            await options.onError("x2y2-listing", error, {
              orderId: x2y2Details[0].orderId,
              additionalInfo: { detail: x2y2Details[0], taker },
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              isUnrecoverable: (error as any).response?.data?.errors?.some((e: { code: number }) =>
                Sdk.X2Y2.Helpers.UnrecoverableErrorCodes.includes(e.code)
              ),
            });
          }

          if (!options?.partial) {
            throw new Error(getErrorMessage(error));
          }
        }
      } else {
        const inputs: (string | undefined)[] = await Promise.all(
          orders.map(async (order, i) =>
            // Fetch X2Y2-signed input
            exchange
              .fetchInput(
                // For X2Y2, the module acts as the taker proxy
                module.address,
                order,
                {
                  source: options?.source,
                  tokenId: x2y2Details[i].tokenId,
                }
              )
              .then(
                (input) =>
                  // Decode the input from the X2Y2 API response
                  exchange.contract.interface.decodeFunctionData("run", input).input
              )
              .catch(async (error) => {
                if (options?.onError) {
                  await options.onError("x2y2-listing", error, {
                    orderId: x2y2Details[i].orderId,
                    additionalInfo: { detail: x2y2Details[i], taker },
                  });
                }

                if (!options?.partial) {
                  throw new Error(getErrorMessage(error));
                }
              })
          )
        );

        if (inputs.some(Boolean)) {
          executions.push({
            info: {
              module: module.address,
              data: module.interface.encodeFunctionData("acceptETHListings", [
                inputs.filter(Boolean),
                {
                  fillTo: taker,
                  refundTo: relayer,
                  revertIfIncomplete: Boolean(!options?.partial),
                  amount: price,
                },
                fees,
              ]),
              value: totalPrice,
            },
            orderIds: x2y2Details.filter((_, i) => inputs[i]).map((d) => d.orderId),
          });

          // Track any possibly required swap
          swapDetails.push({
            tokenIn: buyInCurrency,
            tokenOut: Sdk.Common.Addresses.Native[this.chainId],
            tokenOutAmount: totalPrice,
            recipient: module.address,
            refundTo: relayer,
            details: x2y2Details,
            executionIndex: executions.length - 1,
          });

          addRouterTags("x2y2", orders.length, fees.length);

          for (let i = 0; i < x2y2Details.length; i++) {
            if (inputs[i]) {
              // Mark the listing as successfully handled
              success[x2y2Details[i].orderId] = true;
            }
          }
        }
      }
    }

    // Handle ZeroExV4 ERC721 listings
    if (Object.keys(zeroexV4Erc721Details).length) {
      const exchange = new Sdk.ZeroExV4.Exchange(this.chainId, String(this.options?.cbApiKey));
      for (const currency of Object.keys(zeroexV4Erc721Details)) {
        const currencyDetails = zeroexV4Erc721Details[currency];

        let orders = currencyDetails.map((d) => d.order as Sdk.ZeroExV4.Order);
        const module = this.contracts.zeroExV4Module;

        const unsuccessfulCbIds: string[] = [];
        for (const [i, order] of orders.entries()) {
          const cbId = order.params.cbOrderId;
          if (cbId) {
            // Release the order's signature
            await exchange.releaseOrder(taker, order).catch(async (error) => {
              if (options?.onError) {
                await options.onError("zeroex-v4-erc721-listing", error, {
                  orderId: currencyDetails[i].orderId,
                  additionalInfo: { detail: currencyDetails[i], taker },
                });
              }

              if (!options?.partial) {
                throw new Error(getErrorMessage(error));
              } else {
                unsuccessfulCbIds.push(cbId);
              }
            });
          }
        }
        // Remove any orders that were unsuccessfully released
        if (unsuccessfulCbIds.length) {
          orders = orders.filter((order) => !unsuccessfulCbIds.includes(order.params.cbOrderId!));
        }

        if (orders.length) {
          const fees = getFees(currencyDetails);
          const price = orders
            .map((order) =>
              bn(order.params.erc20TokenAmount).add(
                // For ZeroExV4, the fees are not included in the price
                // TODO: Add order method to get the price including the fees
                order.getFeeAmount()
              )
            )
            .reduce((a, b) => a.add(b), bn(0));
          const feeAmount = fees.map(({ amount }) => bn(amount)).reduce((a, b) => a.add(b), bn(0));
          const totalPrice = price.add(feeAmount);

          const currencyIsETH = isETH(this.chainId, currency);
          const buyInCurrencyIsETH = isETH(this.chainId, buyInCurrency);

          executions.push({
            info: {
              module: module.address,
              data:
                orders.length === 1
                  ? module.interface.encodeFunctionData(
                      `accept${currencyIsETH ? "ETH" : "ERC20"}ListingERC721`,
                      [
                        orders[0].getRaw(),
                        orders[0].params,
                        {
                          fillTo: taker,
                          refundTo: relayer,
                          revertIfIncomplete: Boolean(!options?.partial),
                          amount: price,
                          // Only needed for ERC20 listings
                          token: currency,
                        },
                        fees,
                      ]
                    )
                  : this.contracts.zeroExV4Module.interface.encodeFunctionData(
                      `accept${currencyIsETH ? "ETH" : "ERC20"}ListingsERC721`,
                      [
                        orders.map((order) => order.getRaw()),
                        orders.map((order) => order.params),
                        {
                          fillTo: taker,
                          refundTo: relayer,
                          revertIfIncomplete: Boolean(!options?.partial),
                          amount: price,
                          // Only needed for ERC20 listings
                          token: currency,
                        },
                        fees,
                      ]
                    ),
              value: buyInCurrencyIsETH && currencyIsETH ? totalPrice : 0,
            },
            orderIds: currencyDetails.map((d) => d.orderId),
          });

          // Track any possibly required swap
          swapDetails.push({
            tokenIn: buyInCurrency,
            tokenOut: currency,
            tokenOutAmount: totalPrice,
            recipient: module.address,
            refundTo: relayer,
            details: currencyDetails,
            executionIndex: executions.length - 1,
          });

          addRouterTags("zeroex-v4", orders.length, fees.length);

          // Mark the listings as successfully handled
          for (const { orderId } of currencyDetails) {
            success[orderId] = true;
          }
        }
      }
    }

    // Handle ZeroExV4 ERC1155 listings
    if (Object.keys(zeroexV4Erc1155Details).length) {
      const exchange = new Sdk.ZeroExV4.Exchange(this.chainId, String(this.options?.cbApiKey));
      for (const currency of Object.keys(zeroexV4Erc1155Details)) {
        const currencyDetails = zeroexV4Erc1155Details[currency];

        let orders = currencyDetails.map((d) => d.order as Sdk.ZeroExV4.Order);
        const module = this.contracts.zeroExV4Module;

        const unsuccessfulCbIds: string[] = [];
        for (const [i, order] of orders.entries()) {
          const cbId = order.params.cbOrderId;
          if (cbId) {
            // Release the order's signature
            await exchange.releaseOrder(taker, order).catch(async (error) => {
              if (options?.onError) {
                await options.onError("zeroex-v4-erc1155-listing", error, {
                  orderId: currencyDetails[i].orderId,
                  additionalInfo: { detail: currencyDetails[i], taker },
                });
              }

              if (!options?.partial) {
                throw new Error(getErrorMessage(error));
              } else {
                unsuccessfulCbIds.push(cbId);
              }
            });
          }
        }
        // Remove any orders that were unsuccessfully released
        if (unsuccessfulCbIds.length) {
          orders = orders.filter((order) => !unsuccessfulCbIds.includes(order.params.cbOrderId!));
        }

        if (orders.length) {
          const fees = getFees(currencyDetails);
          const price = orders
            .map((order, i) =>
              bn(order.params.erc20TokenAmount)
                // For ZeroExV4, the fees are not included in the price
                // TODO: Add order method to get the price including the fees
                .add(order.getFeeAmount())
                .mul(currencyDetails[i].amount ?? 1)
                // Round up
                // TODO: ZeroExV4 ERC1155 orders are partially-fillable
                .add(bn(order.params.nftAmount ?? 1).sub(1))
                .div(order.params.nftAmount ?? 1)
            )
            .reduce((a, b) => a.add(b), bn(0));
          const feeAmount = fees.map(({ amount }) => bn(amount)).reduce((a, b) => a.add(b), bn(0));
          const totalPrice = price.add(feeAmount);

          const currencyIsETH = isETH(this.chainId, currency);
          const buyInCurrencyIsETH = isETH(this.chainId, buyInCurrency);

          executions.push({
            info: {
              module: module.address,
              data:
                orders.length === 1
                  ? module.interface.encodeFunctionData(
                      `accept${currencyIsETH ? "ETH" : "ERC20"}ListingERC1155`,
                      [
                        orders[0].getRaw(),
                        orders[0].params,
                        currencyDetails[0].amount ?? 1,
                        {
                          fillTo: taker,
                          refundTo: relayer,
                          revertIfIncomplete: Boolean(!options?.partial),
                          amount: price,
                          // Only needed for ERC20 listings
                          token: currency,
                        },
                        fees,
                      ]
                    )
                  : this.contracts.zeroExV4Module.interface.encodeFunctionData(
                      `accept${currencyIsETH ? "ETH" : "ERC20"}ListingsERC1155`,
                      [
                        orders.map((order) => order.getRaw()),
                        orders.map((order) => order.params),
                        currencyDetails.map((d) => d.amount ?? 1),
                        {
                          fillTo: taker,
                          refundTo: relayer,
                          revertIfIncomplete: Boolean(!options?.partial),
                          amount: price,
                          // Only needed for ERC20 listings
                          token: currency,
                        },
                        fees,
                      ]
                    ),
              value: buyInCurrencyIsETH && currencyIsETH ? totalPrice : 0,
            },
            orderIds: currencyDetails.map((d) => d.orderId),
          });

          // Track any possibly required swap
          swapDetails.push({
            tokenIn: buyInCurrency,
            tokenOut: currency,
            tokenOutAmount: totalPrice,
            recipient: module.address,
            refundTo: relayer,
            details: currencyDetails,
            executionIndex: executions.length - 1,
          });

          addRouterTags("zeroex-v4", orders.length, fees.length);

          // Mark the listings as successfully handled
          for (const { orderId } of currencyDetails) {
            success[orderId] = true;
          }
        }
      }
    }

    // Handle Zora listings
    if (zoraDetails.length) {
      const orders = zoraDetails.map((d) => d.order as Sdk.Zora.Order);
      const module = this.contracts.zoraModule;

      const fees = getFees(zoraDetails);
      const price = orders
        .map((order) => bn(order.params.askPrice))
        .reduce((a, b) => a.add(b), bn(0));
      const feeAmount = fees.map(({ amount }) => bn(amount)).reduce((a, b) => a.add(b), bn(0));
      const totalPrice = price.add(feeAmount);

      executions.push({
        info: {
          module: module.address,
          data:
            orders.length === 1
              ? module.interface.encodeFunctionData("acceptETHListing", [
                  {
                    collection: orders[0].params.tokenContract,
                    tokenId: orders[0].params.tokenId,
                    currency: orders[0].params.askCurrency,
                    amount: orders[0].params.askPrice,
                    finder: taker,
                  },
                  {
                    fillTo: taker,
                    refundTo: relayer,
                    revertIfIncomplete: Boolean(!options?.partial),
                    amount: price,
                  },
                  fees,
                ])
              : module.interface.encodeFunctionData("acceptETHListings", [
                  orders.map((order) => ({
                    collection: order.params.tokenContract,
                    tokenId: order.params.tokenId,
                    currency: order.params.askCurrency,
                    amount: order.params.askPrice,
                    finder: taker,
                  })),
                  {
                    fillTo: taker,
                    refundTo: relayer,
                    revertIfIncomplete: Boolean(!options?.partial),
                    amount: price,
                  },
                  fees,
                ]),
          value: totalPrice,
        },
        orderIds: zoraDetails.map((d) => d.orderId),
      });

      // Track any possibly required swap
      swapDetails.push({
        tokenIn: buyInCurrency,
        tokenOut: Sdk.Common.Addresses.Native[this.chainId],
        tokenOutAmount: totalPrice,
        recipient: module.address,
        refundTo: relayer,
        details: zoraDetails,
        executionIndex: executions.length - 1,
      });

      addRouterTags("zora", orders.length, fees.length);

      // Mark the listings as successfully handled
      for (const { orderId } of zoraDetails) {
        success[orderId] = true;
      }
    }

    // Handle Rarible listings
    if (raribleDetails.length) {
      const orders = raribleDetails.map((d) => d.order as Sdk.Rarible.Order);
      const module = this.contracts.raribleModule;

      const fees = getFees(raribleDetails);
      const price = orders
        .map((order) => bn(order.params.take.value))
        .reduce((a, b) => a.add(b), bn(0));
      const feeAmount = fees.map(({ amount }) => bn(amount)).reduce((a, b) => a.add(b), bn(0));
      const totalPrice = price.add(feeAmount);

      executions.push({
        info: {
          module: module.address,
          data:
            orders.length === 1
              ? module.interface.encodeFunctionData("acceptETHListing", [
                  encodeForMatchOrders(orders[0].params),
                  orders[0].params.signature,
                  encodeForMatchOrders(
                    orders[0].buildMatching(module.address, {
                      amount: raribleDetails[0].amount,
                    })
                  ),
                  "0x",
                  {
                    fillTo: taker,
                    refundTo: relayer,
                    revertIfIncomplete: Boolean(!options?.partial),
                    amount: price,
                  },
                  fees,
                ])
              : module.interface.encodeFunctionData("acceptETHListings", [
                  orders.map((order) => encodeForMatchOrders(order.params)),
                  orders.map((order) => order.params.signature),
                  orders.map((order, index) =>
                    encodeForMatchOrders(
                      order.buildMatching(module.address, {
                        amount: raribleDetails[index].amount,
                      })
                    )
                  ),
                  "0x",
                  {
                    fillTo: taker,
                    refundTo: relayer,
                    revertIfIncomplete: Boolean(!options?.partial),
                    amount: price,
                  },
                  fees,
                ]),
          value: totalPrice,
        },
        orderIds: raribleDetails.map((d) => d.orderId),
      });

      // Track any possibly required swap
      swapDetails.push({
        tokenIn: buyInCurrency,
        tokenOut: Sdk.Common.Addresses.Native[this.chainId],
        tokenOutAmount: totalPrice,
        recipient: module.address,
        refundTo: relayer,
        details: raribleDetails,
        executionIndex: executions.length - 1,
      });

      addRouterTags("rarible", orders.length, fees.length);

      // Mark the listings as successfully handled
      for (const { orderId } of raribleDetails) {
        success[orderId] = true;
      }
    }

    // Handle SuperRare listings
    if (superRareDetails.length) {
      const orders = superRareDetails.map((d) => d.order as Sdk.SuperRare.Order);
      const module = this.contracts.superRareModule;

      // 3% charged on top of the price within the order
      const percentageOnTop = 3;

      const fees = getFees(superRareDetails);
      const price = orders.map((order) => bn(order.params.price)).reduce((a, b) => a.add(b), bn(0));
      const feeAmount = fees.map(({ amount }) => bn(amount)).reduce((a, b) => a.add(b), bn(0));
      const totalPrice = price.add(price.mul(percentageOnTop).div(100)).add(feeAmount);

      executions.push({
        info: {
          module: module.address,
          data:
            orders.length === 1
              ? module.interface.encodeFunctionData("acceptETHListing", [
                  {
                    ...orders[0].params,
                    token: orders[0].params.contract,
                    priceWithFees: bn(orders[0].params.price).add(
                      bn(orders[0].params.price).mul(percentageOnTop).div(100)
                    ),
                  },
                  {
                    fillTo: taker,
                    refundTo: relayer,
                    revertIfIncomplete: Boolean(!options?.partial),
                    amount: price.add(price.mul(percentageOnTop).div(100)),
                  },
                  fees,
                ])
              : module.interface.encodeFunctionData("acceptETHListings", [
                  orders.map((order) => ({
                    ...order.params,
                    token: order.params.contract,
                    priceWithFees: bn(orders[0].params.price).add(
                      bn(orders[0].params.price).mul(percentageOnTop).div(100)
                    ),
                  })),
                  {
                    fillTo: taker,
                    refundTo: relayer,
                    revertIfIncomplete: Boolean(!options?.partial),
                    amount: price.add(price.mul(percentageOnTop).div(100)),
                  },
                  fees,
                ]),
          value: totalPrice,
        },
        orderIds: superRareDetails.map((d) => d.orderId),
      });

      // Track any possibly required swap
      swapDetails.push({
        tokenIn: buyInCurrency,
        tokenOut: Sdk.Common.Addresses.Native[this.chainId],
        tokenOutAmount: totalPrice,
        recipient: this.contracts.superRareModule.address,
        refundTo: relayer,
        details: superRareDetails,
        executionIndex: executions.length - 1,
      });

      addRouterTags("superrare", orders.length, fees.length);

      // Mark the listings as successfully handled
      for (const { orderId } of superRareDetails) {
        success[orderId] = true;
      }
    }

    // Handle CryptoPunks listings
    if (cryptoPunksDetails.length) {
      const orders = cryptoPunksDetails.map((d) => d.order as Sdk.CryptoPunks.Order);
      const module = this.contracts.cryptoPunksModule;
      const fees = getFees(cryptoPunksDetails);

      const price = orders.map((order) => bn(order.params.price)).reduce((a, b) => a.add(b), bn(0));
      const feeAmount = fees.map(({ amount }) => bn(amount)).reduce((a, b) => a.add(b), bn(0));
      const totalPrice = price.add(feeAmount);

      executions.push({
        info: {
          module: module.address,
          data: module.interface.encodeFunctionData("batchBuyPunksWithETH", [
            orders.map((order) => ({
              buyer: taker,
              price: order.params.price,
              punkIndex: order.params.tokenId,
            })),
            {
              fillTo: taker,
              refundTo: relayer,
              revertIfIncomplete: Boolean(!options?.partial),
              amount: price,
            },
            fees,
          ]),
          value: totalPrice,
        },
        orderIds: cryptoPunksDetails.map((d) => d.orderId),
      });

      // Track any possibly required swap
      swapDetails.push({
        tokenIn: buyInCurrency,
        tokenOut: Sdk.Common.Addresses.Native[this.chainId],
        tokenOutAmount: totalPrice,
        recipient: module.address,
        refundTo: relayer,
        details: cryptoPunksDetails,
        executionIndex: executions.length - 1,
      });

      addRouterTags("cryptopunks", orders.length, fees.length);

      // Mark the listings as successfully handled
      for (const { orderId } of cryptoPunksDetails) {
        success[orderId] = true;
      }
    }

    // Handle PaymentProcessor listings
    if (Object.keys(paymentProcessorDetails).length) {
      for (const currency of Object.keys(paymentProcessorDetails)) {
        const currencyDetails = paymentProcessorDetails[currency];

        const orders = currencyDetails.map((d) => d.order as Sdk.PaymentProcessor.Order);
        const module = this.contracts.paymentProcessorModule;

        const fees = getFees(currencyDetails);
        const price = orders
          .map((order) => bn(order.params.price))
          .reduce((a, b) => a.add(b), bn(0));
        const feeAmount = fees.map(({ amount }) => bn(amount)).reduce((a, b) => a.add(b), bn(0));
        const totalPrice = price.add(feeAmount);

        const currencyIsETH = isETH(this.chainId, currency);
        const buyInCurrencyIsETH = isETH(this.chainId, buyInCurrency);

        executions.push({
          info: {
            module: module.address,
            data: module.interface.encodeFunctionData(
              `accept${currencyIsETH ? "ETH" : "ERC20"}Listings`,
              [
                orders.map((order) =>
                  order.getMatchedOrder(
                    order.buildMatching({
                      taker: module.address,
                      takerMasterNonce: "0",
                    })
                  )
                ),
                orders.map((order) => order.params),
                {
                  fillTo: taker,
                  refundTo: relayer,
                  revertIfIncomplete: Boolean(!options?.partial),
                  amount: price,
                  // Only needed for ERC20 listings
                  token: currency,
                },
                fees,
              ]
            ),
            value: buyInCurrencyIsETH && currencyIsETH ? totalPrice : 0,
          },
          orderIds: currencyDetails.map((d) => d.orderId),
        });

        // Track any possibly required swap
        swapDetails.push({
          tokenIn: buyInCurrency,
          tokenOut: currency,
          tokenOutAmount: totalPrice,
          recipient: module.address,
          refundTo: relayer,
          details: currencyDetails,
          executionIndex: executions.length - 1,
        });

        addRouterTags("payment-processor", currencyDetails.length, fees.length);

        // Mark the listings as successfully handled
        for (const { orderId } of currencyDetails) {
          success[orderId] = true;
        }
      }
    }

    // Handle any needed swaps

    const successfulSwapInfos: SwapInfo[] = [];
    const unsuccessfulDependentExecutionIndexes: number[] = [];
    const unsuccessfulDependentTxIndexes: number[] = [];
    if (swapDetails.length) {
      // Aggregate any swap details for the same token pair
      const aggregatedSwapDetails = swapDetails.reduce((perPoolDetails, current) => {
        const { tokenOut, tokenIn } = current;

        let pool: string;
        if (isETH(this.chainId, tokenIn) && isWETH(this.chainId, tokenOut)) {
          pool = `${tokenIn}:${tokenOut}`;
        } else if (isWETH(this.chainId, tokenIn) && isETH(this.chainId, tokenOut)) {
          pool = `${tokenIn}:${tokenOut}`;
        } else {
          const normalizedTokenIn = isETH(this.chainId, tokenIn)
            ? Sdk.Common.Addresses.WNative[this.chainId]
            : tokenIn;
          const normalizedTokenOut = isETH(this.chainId, tokenOut)
            ? Sdk.Common.Addresses.WNative[this.chainId]
            : tokenOut;
          pool = `${normalizedTokenIn}:${normalizedTokenOut}`;
        }

        if (!perPoolDetails[pool]) {
          perPoolDetails[pool] = [];
        }
        perPoolDetails[pool].push(current);

        return perPoolDetails;
      }, {} as PerPoolSwapDetails);

      // For each token pair, generate a swap info
      for (const swapDetails of Object.values(aggregatedSwapDetails)) {
        // All swap details for this pool will have the same out and in tokens
        const { tokenIn, tokenOut } = swapDetails[0];

        const transfers = swapDetails.map((s) => {
          return {
            recipient: s.recipient,
            amount: s.tokenOutAmount,
            // Unwrap if the out token is ETH
            toETH: isETH(this.chainId, s.tokenOut),
          };
        });

        const totalAmountOut = swapDetails
          .map((order) => bn(order.tokenOutAmount))
          .reduce((a, b) => a.add(b), bn(0));

        const swapProvider = options?.swapProvider ?? "uniswap";
        const swapModule =
          swapProvider === "uniswap" ? this.contracts.swapModule : this.contracts.oneInchSwapModule;

        try {
          // Only generate a swap if the in token is different from the out token
          let inAmount = totalAmountOut.toString();
          if (tokenIn !== tokenOut) {
            const swapInfo = await generateSwapInfo(
              this.chainId,
              this.provider,
              swapProvider,
              tokenIn,
              tokenOut,
              totalAmountOut,
              {
                module: swapModule,
                transfers,
                refundTo: relayer,
                revertIfIncomplete: Boolean(!options?.partial),
              }
            );

            successfulSwapInfos.push(swapInfo);

            // Update the in amount
            inAmount = swapInfo.amountIn.toString();
          }

          if (!isETH(this.chainId, tokenIn)) {
            const conduitController = new Sdk.SeaportBase.ConduitController(this.chainId);
            const conduit = conduitController.deriveConduit(
              Sdk.SeaportBase.Addresses.ReservoirConduitKey[this.chainId]
            );

            approvals.push({
              currency: tokenIn,
              amount: inAmount,
              owner: relayer,
              operator: conduit,
              txData: generateFTApprovalTxData(tokenIn, relayer, conduit),
            });

            if (tokenIn !== tokenOut) {
              // The swap module will take care of handling additional transfers
              ftTransferItems.push({
                items: [
                  {
                    itemType: ApprovalProxy.ItemType.ERC20,
                    token: tokenIn,
                    identifier: 0,
                    amount: inAmount,
                  },
                ],
                recipient: swapModule.address,
              });
            } else {
              // Split based on the individual transfers
              ftTransferItems.push(
                ...transfers.map((t) => ({
                  items: [
                    {
                      itemType: ApprovalProxy.ItemType.ERC20,
                      token: tokenIn,
                      identifier: 0,
                      amount: t.amount,
                    },
                  ],
                  recipient: t.recipient,
                }))
              );
            }
          }
        } catch (error) {
          // Since the swap execution generation failed, we should also skip the associated fill executions
          await Promise.all(
            swapDetails.map(async (s) => {
              for (const detail of s.details) {
                success[detail.orderId] = false;
                txs.forEach((tx) => {
                  tx.orderIds = tx.orderIds.filter((orderId) => orderId !== detail.orderId);
                });

                if (options?.onError) {
                  await options.onError("swap-generation", error, {
                    orderId: detail.orderId,
                    additionalInfo: { detail, taker },
                  });
                }
              }

              if (s.executionIndex !== undefined) {
                unsuccessfulDependentExecutionIndexes.push(s.executionIndex);
              }
              if (s.txIndex !== undefined) {
                unsuccessfulDependentTxIndexes.push(s.txIndex);
              }
            })
          );

          if (!options?.partial) {
            throw new Error(getErrorMessage(error));
          }
        }
      }
    }

    // Filter out any executions / txs / order ids that depend on failed swaps
    executions = executions.filter((_, i) => !unsuccessfulDependentExecutionIndexes.includes(i));
    txs = txs.filter((_, i) => !unsuccessfulDependentTxIndexes.includes(i));

    routerTxTags.swaps! += successfulSwapInfos.length;

    if (executions.length || successfulSwapInfos.length) {
      // Prepend any swap executions
      executions = [
        ...mergeSwapInfos(this.chainId, successfulSwapInfos).map((info) => ({
          info: info.execution,
          orderIds: [],
        })),
        ...executions,
      ];

      // If the buy-in currency is not ETH then we won't need any `value` fields
      if (buyInCurrency !== Sdk.Common.Addresses.Native[this.chainId]) {
        executions.forEach((e) => {
          e.info.value = 0;
        });
      }

      if (options?.usePermit) {
        const supportedPermitCurrencies = Sdk.Common.Addresses.Usdc[this.chainId] ?? [];
        if (!supportedPermitCurrencies.includes(buyInCurrency)) {
          throw new Error("Buying with permit not supported");
        }

        // The swap execution should always be the first tx in the list
        txs = [
          {
            approvals: [],
            preSignatures: [],
            txTags: routerTxTags,
            permits: await new PermitHandler(this.chainId, this.provider).generate(
              relayer,
              Addresses.PermitProxy[this.chainId],
              {
                kind: "with-transfers",
                transferItems: ftTransferItems,
              }
            ),
            txData: {
              from: relayer,
              ...{
                to: this.contracts.router.address,
                data:
                  this.contracts.router.interface.encodeFunctionData("execute", [
                    executions.map((e) => e.info),
                  ]) + generateSourceBytes(options?.source),
                value: executions
                  .map((e) => bn(e.info.value))
                  .reduce((a, b) => a.add(b))
                  .toHexString(),
              },
            },
            orderIds: executions.map((e) => e.orderIds).flat(),
          },
          ...txs,
        ];
      } else {
        // Filter out any duplicate approvals
        const uniqueApprovals: { [id: string]: FTApproval } = {};
        for (const approval of approvals) {
          const id = approval.owner + approval.currency + approval.txData;
          if (!uniqueApprovals[id]) {
            uniqueApprovals[id] = approval;
          }
        }

        // The swap execution should always be the first tx in the list
        txs = [
          {
            approvals: Object.values(uniqueApprovals),
            permits: [],
            preSignatures: [],
            txTags: routerTxTags,
            txData: {
              from: relayer,
              ...(ftTransferItems.length
                ? {
                    to: this.contracts.approvalProxy.address,
                    data:
                      this.contracts.approvalProxy.interface.encodeFunctionData(
                        "bulkTransferWithExecute",
                        [
                          ftTransferItems,
                          executions.map((e) => e.info),
                          Sdk.SeaportBase.Addresses.ReservoirConduitKey[this.chainId],
                        ]
                      ) + generateSourceBytes(options?.source),
                  }
                : {
                    to: this.contracts.router.address,
                    data:
                      this.contracts.router.interface.encodeFunctionData("execute", [
                        executions.map((e) => e.info),
                      ]) + generateSourceBytes(options?.source),
                    value: executions
                      .map((e) => bn(e.info.value))
                      .reduce((a, b) => a.add(b))
                      .toHexString(),
                  }),
            },
            orderIds: executions.map((e) => e.orderIds).flat(),
          },
          ...txs,
        ];
      }
    }

    return {
      txs,
      success,
    };
  }

  // Fill multiple bids in a single transaction
  public async fillBidsTx(
    details: BidDetails[],
    taker: string,
    options?: {
      // Fill source for attribution
      source?: string;
      // Skip any errors (either off-chain or on-chain)
      partial?: boolean;
      // Force filling via the approval proxy
      forceApprovalProxy?: boolean;
      // Needed for filling Blur orders
      blurAuth?: {
        accessToken: string;
      };
      // Callback for handling errors
      onError?: (
        kind: string,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        error: any,
        data: {
          orderId: string;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          additionalInfo: any;
          isUnrecoverable?: boolean;
        }
      ) => Promise<void>;
    }
  ): Promise<FillBidsResult> {
    // Assume the bid details are consistent with the underlying order object

    // When filling a single order in partial mode, propagate any errors back directly
    if (options?.partial && details.length === 1) {
      options.partial = false;
    }

    const txs: FillBidsResult["txs"][0][] = [];
    const success: { [orderId: string]: boolean } = {};

    // CASE 1
    // Handle orders which require/support special handling such as direct filling

    const blurDetails = details.filter((d) => d.source === "blur.io");
    if (blurDetails.length) {
      try {
        // We'll have one transaction per contract
        const result: {
          [contract: string]: {
            from: string;
            to: string;
            data: string;
            value: string;
            path: { contract: string; tokenId: string }[];
            errors: { tokenId: string; reason: string }[];
          };
        } = await axios
          .post(`${this.options?.orderFetcherBaseUrl}/api/blur-offer`, {
            taker,
            tokens: blurDetails.map((d) => ({
              contract: d.contract,
              tokenId: d.tokenId,
              price: d.price,
            })),
            authToken: options?.blurAuth?.accessToken,
          })
          .then((response) => response.data.calldata);

        for (const [contract, data] of Object.entries(result)) {
          const successfulBlurDetails: BidDetails[] = [];
          for (const { tokenId } of data.path) {
            const detail = blurDetails.find(
              (d) => d.contract === contract && d.tokenId === tokenId
            );
            if (detail) {
              successfulBlurDetails.push(detail);
            }
          }

          // Expose errors
          for (const { tokenId, reason } of data.errors) {
            if (options?.onError) {
              const detail = blurDetails.find(
                (d) => d.contract === contract && d.tokenId === tokenId
              );
              if (detail) {
                await options.onError("order-fetcher-blur-offers", new Error(reason), {
                  orderId: detail.orderId,
                  additionalInfo: { detail, taker, contract },
                });
              }
            }
          }

          // If we have at least one Blur detail, we should go ahead with the calldata returned by Blur
          if (successfulBlurDetails.length) {
            // Mark the orders handled by Blur as successful
            const orderIds: string[] = [];
            for (const d of successfulBlurDetails) {
              success[d.orderId] = true;
              orderIds.push(d.orderId);
            }

            txs.push({
              approvals: [],
              txTags: {
                bids: { blur: blurDetails.length },
              },
              txData: {
                from: data.from,
                to: data.to,
                data: data.data + generateSourceBytes(options?.source),
                value: data.value,
              },
              preSignatures: [],
              orderIds,
            });
          }
        }
      } catch (error) {
        if (options?.onError) {
          for (const detail of blurDetails) {
            if (!success[detail.orderId]) {
              await options.onError("order-fetcher-blur-offers", error, {
                orderId: detail.orderId,
                additionalInfo: { detail, taker },
              });
            }
          }
        }

        if (!options?.partial) {
          throw new Error(getErrorMessage(error));
        }
      }
    }

    // Check if we still have any Blur bids for which we didn't properly generate calldata
    if (blurDetails.find((d) => !success[d.orderId])) {
      if (!options?.partial) {
        throw new Error("Could not fetch calldata for all Blur bids");
      }
    }

    const getFees = (ownDetail: BidDetails) =>
      (ownDetail.fees ?? []).filter(
        ({ amount, recipient }) =>
          // Skip zero amounts and/or recipients
          bn(amount).gt(0) && recipient !== AddressZero
      );

    // Fill PaymentProcessor offers directly
    const paymentProcessorDetails = details.filter((d) => d.kind === "payment-processor");
    if (paymentProcessorDetails.length) {
      const exchange = new Sdk.PaymentProcessor.Exchange(this.chainId);
      const operator = exchange.contract.address;

      const orders: Sdk.PaymentProcessor.Order[] = [];
      const takeOrders: Sdk.PaymentProcessor.Order[] = [];
      const preSignatures: PreSignature[] = [];

      const approvals: NFTApproval[] = [];
      for (const detail of paymentProcessorDetails) {
        const order = detail.order as Sdk.PaymentProcessor.Order;
        const takerOrder = order.buildMatching({
          tokenId: detail.tokenId,
          taker,
          takerMasterNonce: await exchange.getMasterNonce(this.provider, taker),
          maxRoyaltyFeeNumerator: detail.extraArgs?.maxRoyaltyFeeNumerator ?? "0",
        });

        orders.push(order);
        takeOrders.push(takerOrder);

        const signData = takerOrder.getSignatureData();
        preSignatures.push({
          kind: "payment-processor-take-order",
          signer: taker,
          data: signData,
          uniqueId: `${takerOrder.params.tokenAddress}-${takerOrder.params.tokenId}-${takerOrder.params.price}`,
        });

        // Generate approval
        approvals.push({
          orderIds: [detail.orderId],
          contract: takerOrder.params.tokenAddress,
          owner: taker,
          operator,
          txData: generateNFTApprovalTxData(takerOrder.params.tokenAddress, taker, operator),
        });

        success[detail.orderId] = true;
      }

      txs.push({
        approvals: uniqBy(approvals, ({ txData: { from, to, data } }) => `${from}-${to}-${data}`),
        preSignatures,
        txTags: {
          bids: { "payment-processor": orders.length },
        },
        txData: exchange.fillOrdersTx(taker, orders, takeOrders, options),
        orderIds: paymentProcessorDetails.map((d) => d.orderId),
      });
    }

    // Fill PaymentProcessorV2 offers directly
    if (details.some(({ kind }) => kind === "payment-processor-v2")) {
      const ppv2Details = details.filter(({ kind }) => kind === "payment-processor-v2");

      const exchange = new Sdk.PaymentProcessorV2.Exchange(this.chainId);
      const operator = exchange.contract.address;

      const orders: Sdk.PaymentProcessorV2.Order[] = ppv2Details.map(
        (c) => c.order as Sdk.PaymentProcessorV2.Order
      );
      const allFees = ppv2Details.map((c) => getFees(c));

      const approvals: NFTApproval[] = [];
      for (const { orderId, contract } of ppv2Details) {
        approvals.push({
          orderIds: [orderId],
          contract: contract,
          owner: taker,
          operator,
          txData: generateNFTApprovalTxData(contract, taker, operator),
        });
      }

      txs.push({
        approvals,
        txTags: {
          listings: { "payment-processor-v2": orders.length },
        },
        preSignatures: [],
        txData: exchange.fillOrdersTx(
          taker,
          orders,
          orders.map((_, i) => {
            return {
              taker,
              tokenId: details[i].tokenId,
              amount: details[i].amount ?? 1,
              maxRoyaltyFeeNumerator: details[i].extraArgs?.maxRoyaltyFeeNumerator ?? "0",
            };
          }),
          { fees: allFees.map((c) => c[0]) }
        ),
        orderIds: ppv2Details.map((d) => d.orderId),
      });

      for (const { orderId } of ppv2Details) {
        success[orderId] = true;
      }
    }

    // CASE 2
    // Handle exchanges which do have a router module implemented by filling through the router

    // Step 1
    // Handle approvals and permits

    // Keep track of any approvals that might be needed
    const approvals: NFTApproval[] = [];

    // Keep track of any NFT transfers that need to be performed
    const nftTransferItems: ApprovalProxy.TransferItem[] = [];

    for (let i = 0; i < details.length; i++) {
      const detail = details[i];
      if (success[detail.orderId]) {
        continue;
      }

      if (!(details.length === 1 && !options?.forceApprovalProxy)) {
        const contract = detail.contract;
        const owner = taker;
        const conduitController = new Sdk.SeaportBase.ConduitController(this.chainId);
        const operator = conduitController.deriveConduit(
          Sdk.SeaportBase.Addresses.ReservoirConduitKey[this.chainId]
        );

        // Generate approval
        approvals.push({
          orderIds: [detail.orderId],
          contract,
          owner,
          operator,
          txData: generateNFTApprovalTxData(contract, owner, operator),
        });
      }

      // Generate permit item
      let module: Contract;
      switch (detail.kind) {
        case "looks-rare-v2": {
          module = this.contracts.looksRareV2Module;
          break;
        }

        case "seaport": {
          module = this.contracts.seaportModule;
          break;
        }

        case "seaport-v1.4": {
          module = this.contracts.seaportV14Module;
          break;
        }

        case "seaport-v1.5":
        case "seaport-v1.5-partial": {
          module = this.contracts.seaportV15Module;
          break;
        }

        case "alienswap": {
          module = this.contracts.alienswapModule;
          break;
        }

        case "sudoswap": {
          module = this.contracts.sudoswapModule;
          break;
        }

        case "sudoswap-v2": {
          module = this.contracts.sudoswapV2Module;
          break;
        }

        case "midaswap": {
          module = this.contracts.midaswapModule;
          break;
        }

        case "caviar-v1": {
          module = this.contracts.caviarV1Module;
          break;
        }

        case "collectionxyz": {
          module = this.contracts.collectionXyzModule;
          break;
        }

        case "ditto": {
          module = this.contracts.dittoModule;
          break;
        }

        case "nftx": {
          module = this.contracts.nftxModule;
          break;
        }

        case "x2y2": {
          module = this.contracts.x2y2Module;
          break;
        }

        case "zeroex-v4": {
          module = this.contracts.zeroExV4Module;
          break;
        }

        case "element": {
          module = this.contracts.elementModule;
          break;
        }

        case "rarible": {
          module = this.contracts.raribleModule;
          break;
        }

        case "payment-processor": {
          module = this.contracts.paymentProcessorModule;
          break;
        }

        default: {
          continue;
        }
      }

      nftTransferItems.push({
        items: [
          {
            itemType:
              detail.contractKind === "erc721"
                ? ApprovalProxy.ItemType.ERC721
                : ApprovalProxy.ItemType.ERC1155,
            token: detail.contract,
            identifier: detail.tokenId,
            amount: detail.amount ?? 1,
          },
        ],
        recipient: module.address,
      });
    }

    // Step 2
    // Handle calldata generation

    // Generate router executions
    const executionsWithDetails: {
      detail: BidDetails;
      execution: ExecutionInfo;
    }[] = [];

    // Keep track of tags for the router execution
    const routerTxTags: TxTags = {
      listings: {},
      bids: {},
      mints: 0,
      swaps: 0,
      feesOnTop: 0,
    };
    const addRouterTags = (orderKind: string, numBids: number, numFeesOnTop: number) => {
      if (!routerTxTags.bids![orderKind]) {
        routerTxTags.bids![orderKind] = 0;
      }
      routerTxTags.bids![orderKind] += numBids;
      routerTxTags.feesOnTop! += numFeesOnTop;
    };

    // We aggregate all protected offers and fill them together
    const protectedSeaportV15Offers: {
      detail: BidDetails;
      order: Sdk.SeaportV15.Order;
      fees: Fee[];
      criteriaResolvers: Sdk.SeaportBase.Types.CriteriaResolver[];
      extraData: string;
    }[] = [];

    for (let i = 0; i < details.length; i++) {
      const detail = details[i];
      if (success[detail.orderId]) {
        continue;
      }

      const fees = getFees(detail);

      if (detail.kind !== "seaport-v1.5-partial") {
        addRouterTags(detail.kind, 1, fees.length);
      }

      switch (detail.kind) {
        case "looks-rare-v2": {
          const order = detail.order as Sdk.LooksRareV2.Order;
          const module = this.contracts.looksRareV2Module;

          executionsWithDetails.push({
            detail,
            execution: {
              module: module.address,
              data: module.interface.encodeFunctionData(
                detail.contractKind === "erc721" ? "acceptERC721Offer" : "acceptERC1155Offer",
                [
                  order.params,
                  order.buildMatching(
                    // The module acts as the taker proxy
                    module.address,
                    { tokenId: detail.tokenId }
                  ).additionalParameters,
                  order.params.signature!,
                  order.params.merkleTree ?? { root: HashZero, proof: [] },
                  {
                    fillTo: taker,
                    refundTo: taker,
                    revertIfIncomplete: Boolean(!options?.partial),
                  },
                  fees,
                ]
              ),
              value: 0,
            },
          });

          success[detail.orderId] = true;

          break;
        }

        case "seaport": {
          const order = detail.order as Sdk.SeaportV11.Order;
          const module = this.contracts.seaportModule;

          const matchParams = order.buildMatching({
            tokenId: detail.tokenId,
            amount: detail.amount ?? 1,
            ...(detail.extraArgs ?? {}),
          });

          const exchange = new Sdk.SeaportV11.Exchange(this.chainId);
          executionsWithDetails.push({
            detail,
            execution: {
              module: module.address,
              data: module.interface.encodeFunctionData(
                detail.contractKind === "erc721" ? "acceptERC721Offer" : "acceptERC1155Offer",
                [
                  {
                    parameters: {
                      ...order.params,
                      totalOriginalConsiderationItems: order.params.consideration.length,
                    },
                    numerator: matchParams.amount ?? 1,
                    denominator: order.getInfo()!.amount,
                    signature: order.params.signature,
                    extraData: await exchange.getExtraData(order),
                  },
                  matchParams.criteriaResolvers ?? [],
                  {
                    fillTo: taker,
                    refundTo: taker,
                    revertIfIncomplete: Boolean(!options?.partial),
                  },
                  fees,
                ]
              ),
              value: 0,
            },
          });

          success[detail.orderId] = true;

          break;
        }

        case "seaport-v1.4": {
          const order = detail.order as Sdk.SeaportV14.Order;
          const module = this.contracts.seaportV14Module;

          const matchParams = order.buildMatching({
            tokenId: detail.tokenId,
            amount: detail.amount ?? 1,
            ...(detail.extraArgs ?? {}),
          });

          const exchange = new Sdk.SeaportV14.Exchange(this.chainId);
          executionsWithDetails.push({
            detail,
            execution: {
              module: module.address,
              data: module.interface.encodeFunctionData(
                detail.contractKind === "erc721" ? "acceptERC721Offer" : "acceptERC1155Offer",
                [
                  {
                    parameters: {
                      ...order.params,
                      totalOriginalConsiderationItems: order.params.consideration.length,
                    },
                    numerator: matchParams.amount ?? 1,
                    denominator: order.getInfo()!.amount,
                    signature: order.params.signature,
                    extraData: await exchange.getExtraData(order, matchParams),
                  },
                  matchParams.criteriaResolvers ?? [],
                  {
                    fillTo: taker,
                    refundTo: taker,
                    revertIfIncomplete: Boolean(!options?.partial),
                  },
                  fees,
                ]
              ),
              value: 0,
            },
          });

          success[detail.orderId] = true;

          break;
        }

        case "seaport-v1.5": {
          const order = detail.order as Sdk.SeaportV15.Order;
          const module = this.contracts.seaportV15Module;

          const matchParams = order.buildMatching({
            tokenId: detail.tokenId,
            amount: detail.amount ?? 1,
            ...(detail.extraArgs ?? {}),
          });

          const exchange = new Sdk.SeaportV15.Exchange(this.chainId);
          executionsWithDetails.push({
            detail,
            execution: {
              module: module.address,
              data: module.interface.encodeFunctionData(
                detail.contractKind === "erc721" ? "acceptERC721Offer" : "acceptERC1155Offer",
                [
                  {
                    parameters: {
                      ...order.params,
                      totalOriginalConsiderationItems: order.params.consideration.length,
                    },
                    numerator: matchParams.amount ?? 1,
                    denominator: order.getInfo()!.amount,
                    signature: order.params.signature,
                    extraData: await exchange.getExtraData(order, matchParams),
                  },
                  matchParams.criteriaResolvers ?? [],
                  {
                    fillTo: taker,
                    refundTo: taker,
                    revertIfIncomplete: Boolean(!options?.partial),
                  },
                  fees,
                ]
              ),
              value: 0,
            },
          });

          success[detail.orderId] = true;

          break;
        }

        case "seaport-v1.5-partial": {
          const order = detail.order as Sdk.SeaportBase.Types.OpenseaPartialOrder;
          const module = this.contracts.seaportV15Module;

          try {
            const result = await axios.post(`${this.options?.orderFetcherBaseUrl}/api/offer`, {
              orderHash: order.id,
              contract: order.contract,
              tokenId: order.tokenId,
              taker: detail.isProtected ? taker : detail.owner ?? taker,
              chainId: this.chainId,
              protocolVersion: "v1.5",
              unitPrice: order.unitPrice,
              isProtected: detail.isProtected,
              openseaApiKey: this.options?.openseaApiKey,
              metadata: this.options?.orderFetcherMetadata,
            });

            const fullOrder = new Sdk.SeaportV15.Order(this.chainId, result.data.order);
            if (detail.isProtected) {
              protectedSeaportV15Offers.push({
                detail,
                order: fullOrder,
                fees,
                criteriaResolvers: result.data.criteriaResolvers ?? [],
                extraData: result.data.extraData,
              });
            } else {
              executionsWithDetails.push({
                detail,
                execution: {
                  module: module.address,
                  data: module.interface.encodeFunctionData(
                    detail.contractKind === "erc721" ? "acceptERC721Offer" : "acceptERC1155Offer",
                    [
                      {
                        parameters: {
                          ...fullOrder.params,
                          totalOriginalConsiderationItems: fullOrder.params.consideration.length,
                        },
                        numerator: detail.amount ?? 1,
                        denominator: fullOrder.getInfo()!.amount,
                        signature: fullOrder.params.signature,
                        extraData: result.data.extraData,
                      },
                      result.data.criteriaResolvers ?? [],
                      {
                        fillTo: taker,
                        refundTo: taker,
                        revertIfIncomplete: Boolean(!options?.partial),
                      },
                      fees,
                    ]
                  ),
                  value: 0,
                },
              });
            }

            success[detail.orderId] = true;
          } catch (error) {
            if (options?.onError) {
              options.onError("order-fetcher-opensea-offer", error, {
                orderId: detail.orderId,
                additionalInfo: {
                  detail,
                  taker,
                },
              });
            }

            if (!options?.partial) {
              throw new Error(getErrorMessage(error));
            }
          }

          break;
        }

        case "alienswap": {
          const order = detail.order as Sdk.Alienswap.Order;
          const module = this.contracts.alienswapModule;

          const matchParams = order.buildMatching({
            tokenId: detail.tokenId,
            amount: detail.amount ?? 1,
            ...(detail.extraArgs ?? {}),
          });

          const exchange = new Sdk.Alienswap.Exchange(this.chainId);
          executionsWithDetails.push({
            detail,
            execution: {
              module: module.address,
              data: module.interface.encodeFunctionData(
                detail.contractKind === "erc721" ? "acceptERC721Offer" : "acceptERC1155Offer",
                [
                  {
                    parameters: {
                      ...order.params,
                      totalOriginalConsiderationItems: order.params.consideration.length,
                    },
                    numerator: matchParams.amount ?? 1,
                    denominator: order.getInfo()!.amount,
                    signature: order.params.signature,
                    extraData: await exchange.getExtraData(order),
                  },
                  matchParams.criteriaResolvers ?? [],
                  {
                    fillTo: taker,
                    refundTo: taker,
                    revertIfIncomplete: Boolean(!options?.partial),
                  },
                  fees,
                ]
              ),
              value: 0,
            },
          });

          success[detail.orderId] = true;

          break;
        }

        case "sudoswap": {
          const order = detail.order as Sdk.Sudoswap.Order;
          const module = this.contracts.sudoswapModule;

          executionsWithDetails.push({
            detail,
            execution: {
              module: module.address,
              data: module.interface.encodeFunctionData("sell", [
                order.params.pair,
                detail.tokenId,
                bn(order.params.extra.prices[0]).sub(
                  // Take into account the protocol fee of 0.5%
                  bn(order.params.extra.prices[0]).mul(50).div(10000)
                ),
                Math.floor(Date.now() / 1000) + 10 * 60,
                {
                  fillTo: taker,
                  refundTo: taker,
                  revertIfIncomplete: Boolean(!options?.partial),
                },
                fees,
              ]),
              value: 0,
            },
          });

          success[detail.orderId] = true;

          break;
        }

        case "sudoswap-v2": {
          const order = detail.order as Sdk.SudoswapV2.Order;
          const module = this.contracts.sudoswapV2Module;

          executionsWithDetails.push({
            detail,
            execution: {
              module: module.address,
              data: module.interface.encodeFunctionData("sell", [
                order.params.pair,
                detail.contractKind === "erc721" ? detail.tokenId : detail.amount ?? 1,
                bn(order.params.extra.prices[0]).sub(
                  // Take into account the protocol fee of 0.5%
                  bn(order.params.extra.prices[0]).mul(50).div(10000)
                ),
                {
                  fillTo: taker,
                  refundTo: taker,
                  revertIfIncomplete: Boolean(!options?.partial),
                },
                fees,
              ]),
              value: 0,
            },
          });

          success[detail.orderId] = true;

          break;
        }

        case "midaswap": {
          const order = detail.order as Sdk.Midaswap.Order;
          const module = this.contracts.midaswapModule;

          executionsWithDetails.push({
            detail,
            execution: {
              module: module.address,
              data: module.interface.encodeFunctionData("sell", [
                order.params.tokenX,
                Sdk.Common.Addresses.Native[this.chainId],
                detail.tokenId,
                {
                  fillTo: taker,
                  refundTo: taker,
                  revertIfIncomplete: Boolean(!options?.partial),
                },
                fees,
              ]),
              value: 0,
            },
          });

          success[detail.orderId] = true;

          break;
        }

        case "caviar-v1": {
          const order = detail.order as Sdk.CaviarV1.Order;
          const module = this.contracts.caviarV1Module;

          executionsWithDetails.push({
            detail,
            execution: {
              module: module.address,
              data: module.interface.encodeFunctionData("sell", [
                order.params.pool,
                detail.tokenId,
                bn(order.params.extra.prices[0]),
                detail.extraArgs.stolenProof,
                {
                  fillTo: taker,
                  refundTo: taker,
                  revertIfIncomplete: Boolean(!options?.partial),
                },
                fees,
              ]),
              value: 0,
            },
          });

          success[detail.orderId] = true;

          break;
        }

        case "collectionxyz": {
          const order = detail.order as Sdk.CollectionXyz.Order;
          const module = this.contracts.collectionXyzModule;

          const acceptedSet = detail.extraArgs.tokenIds as string[];
          const { proof, proofFlags } =
            // acceptedSet === [] for unfiltered pools
            acceptedSet.length === 0
              ? { proof: [], proofFlags: [] }
              : new TokenIDs(acceptedSet.map(BigInt)).proof([BigInt(detail.tokenId)]);

          executionsWithDetails.push({
            detail,
            execution: {
              module: module.address,
              data: module.interface.encodeFunctionData("sell", [
                order.params.pool,
                // Single id, no need to sort
                { nftId: detail.tokenId, proof, proofFlags, externalFilterContext: [] },
                bn(order.params.extra.prices[0]).sub(
                  // Take into account any fees
                  bn(order.params.extra.prices[0])
                    .mul(detail.extraArgs?.totalFeeBps ?? 0)
                    .div(10000)
                ),
                Math.floor(Date.now() / 1000) + 10 * 60,
                {
                  fillTo: taker,
                  refundTo: taker,
                  revertIfIncomplete: Boolean(!options?.partial),
                },
                fees,
              ]),
              value: 0,
            },
          });

          success[detail.orderId] = true;

          break;
        }

        case "ditto": {
          const order = detail.order as Sdk.Ditto.Order;
          const module = this.contracts.dittoswapModule;
          const router = new Sdk.Ditto.Router(this.chainId);

          executionsWithDetails.push({
            detail,
            execution: {
              module: module.address,
              data: router.fillSellOrderTx(taker, order).data,
              value: 0,
            },
          });

          success[detail.orderId] = true;

          break;
        }

        case "x2y2": {
          const order = detail.order as Sdk.X2Y2.Order;
          const module = this.contracts.x2y2Module;

          try {
            const exchange = new Sdk.X2Y2.Exchange(this.chainId, String(this.options?.x2y2ApiKey));
            executionsWithDetails.push({
              detail,
              execution: {
                module: module.address,
                data: module.interface.encodeFunctionData(
                  detail.contractKind === "erc721" ? "acceptERC721Offer" : "acceptERC1155Offer",
                  [
                    exchange.contract.interface.decodeFunctionData(
                      "run",
                      await exchange.fetchInput(
                        // For X2Y2, the module acts as the taker proxy
                        module.address,
                        order,
                        {
                          tokenId: detail.tokenId,
                          source: options?.source,
                        }
                      )
                    ).input,
                    {
                      fillTo: taker,
                      refundTo: taker,
                      revertIfIncomplete: Boolean(!options?.partial),
                    },
                    fees,
                  ]
                ),
                value: 0,
              },
            });

            success[detail.orderId] = true;
          } catch (error) {
            if (options?.onError) {
              options.onError("x2y2-offer", error, {
                orderId: detail.orderId,
                additionalInfo: {
                  detail,
                  taker,
                },
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                isUnrecoverable: (error as any).response?.data?.errors?.some(
                  (e: { code: number }) => Sdk.X2Y2.Helpers.UnrecoverableErrorCodes.includes(e.code)
                ),
              });
            }

            if (!options?.partial) {
              throw new Error(getErrorMessage(error));
            }
          }

          break;
        }

        case "zeroex-v4": {
          const order = detail.order as Sdk.ZeroExV4.Order;
          const module = this.contracts.zeroExV4Module;

          try {
            // Retrieve the order's signature
            if (order.params.cbOrderId) {
              await new Sdk.ZeroExV4.Exchange(
                this.chainId,
                String(this.options?.cbApiKey)
              ).releaseOrder(taker, order);
            }

            if (detail.contractKind === "erc721") {
              executionsWithDetails.push({
                detail,
                execution: {
                  module: module.address,
                  data: module.interface.encodeFunctionData("acceptERC721Offer", [
                    order.getRaw(),
                    order.params,
                    {
                      fillTo: taker,
                      refundTo: taker,
                      revertIfIncomplete: Boolean(!options?.partial),
                    },
                    detail.tokenId,
                    fees,
                  ]),
                  value: 0,
                },
              });
            } else {
              executionsWithDetails.push({
                detail,
                execution: {
                  module: module.address,
                  data: module.interface.encodeFunctionData("acceptERC1155Offer", [
                    order.getRaw(),
                    order.params,
                    detail.amount ?? 1,
                    {
                      fillTo: taker,
                      refundTo: taker,
                      revertIfIncomplete: Boolean(!options?.partial),
                    },
                    detail.tokenId,
                    fees,
                  ]),
                  value: 0,
                },
              });
            }

            success[detail.orderId] = true;
          } catch (error) {
            if (options?.onError) {
              options.onError("zeroex-v4-offer", error, {
                orderId: detail.orderId,
                additionalInfo: {
                  detail,
                  taker,
                },
              });
            }

            if (!options?.partial) {
              throw new Error(getErrorMessage(error));
            }
          }

          break;
        }

        case "element": {
          const order = detail.order as Sdk.Element.Order;
          const module = this.contracts.elementModule;

          if (detail.contractKind === "erc721") {
            executionsWithDetails.push({
              detail,
              execution: {
                module: module.address,
                data: module.interface.encodeFunctionData("acceptERC721Offer", [
                  order.getRaw(),
                  order.params,
                  {
                    fillTo: taker,
                    refundTo: taker,
                    revertIfIncomplete: Boolean(!options?.partial),
                  },
                  detail.tokenId,
                  fees,
                ]),
                value: 0,
              },
            });
          } else {
            executionsWithDetails.push({
              detail,
              execution: {
                module: module.address,
                data: module.interface.encodeFunctionData("acceptERC1155Offer", [
                  order.getRaw(),
                  order.params,
                  detail.amount ?? 1,
                  {
                    fillTo: taker,
                    refundTo: taker,
                    revertIfIncomplete: Boolean(!options?.partial),
                  },
                  detail.tokenId,
                  fees,
                ]),
                value: 0,
              },
            });
          }

          success[detail.orderId] = true;

          break;
        }

        case "nftx": {
          const order = detail.order as Sdk.Nftx.Order;

          // Can't use the ZeroEx module here since it only supports single-swaps
          // and here we potentially need multiple swaps for the same token pair,
          // considering the price impact the first swaps have on the next ones.
          const module = this.contracts.nftxModule;

          const tokenId = detail.tokenId;
          order.params.specificIds = [tokenId];

          // Cover the case where the path is missing
          order.params.path = order.params.path.length
            ? order.params.path
            : [order.params.pool, Sdk.Common.Addresses.WNative[this.chainId]];

          executionsWithDetails.push({
            detail,
            execution: {
              module: module.address,
              data: module.interface.encodeFunctionData("sell", [
                [order.params],
                {
                  fillTo: taker,
                  refundTo: taker,
                  revertIfIncomplete: Boolean(!options?.partial),
                },
                fees,
              ]),
              value: 0,
            },
          });

          success[detail.orderId] = true;

          break;
        }

        case "rarible": {
          const order = detail.order as Sdk.Rarible.Order;
          const module = this.contracts.raribleModule;

          const matchParams = order.buildMatching(module.address, {
            tokenId: detail.tokenId,
            assetClass: detail.contractKind.toUpperCase(),
            ...(detail.extraArgs || {}),
          });

          executionsWithDetails.push({
            detail,
            execution: {
              module: module.address,
              data: module.interface.encodeFunctionData(
                detail.contractKind === "erc721" ? "acceptERC721Offer" : "acceptERC1155Offer",
                [
                  encodeForMatchOrders(order.params),
                  order.params.signature,
                  encodeForMatchOrders(matchParams),
                  "0x",
                  {
                    fillTo: taker,
                    refundTo: taker,
                    revertIfIncomplete: Boolean(!options?.partial),
                  },
                  fees,
                ]
              ),
              value: 0,
            },
          });

          success[detail.orderId] = true;

          break;
        }

        case "payment-processor": {
          const order = detail.order as Sdk.PaymentProcessor.Order;
          const module = this.contracts.paymentProcessorModule;

          const takerOrder = order.buildMatching({
            taker: module.address,
            takerMasterNonce: "0",
            tokenId: order.params.collectionLevelOffer ? detail.tokenId : undefined,
            maxRoyaltyFeeNumerator: detail.extraArgs?.maxRoyaltyFeeNumerator ?? "0",
          });
          const matchedOrder = order.getMatchedOrder(takerOrder);

          executionsWithDetails.push({
            detail,
            execution: {
              module: module.address,
              data: module.interface.encodeFunctionData("acceptOffers", [
                [matchedOrder],
                [order.params],
                {
                  fillTo: taker,
                  refundTo: taker,
                  revertIfIncomplete: Boolean(!options?.partial),
                },
                fees,
              ]),
              value: 0,
            },
          });

          success[detail.orderId] = true;

          break;
        }
      }
    }

    // Permits have to be pre-executed
    const preTxs: {
      kind: "permit";
      txData: TxData;
      orderIds: string[];
    }[] = [];

    const detailsWithPermits = details.filter((d) => d.permit && success[d.orderId]);
    const permitHandler = new PermitHandler(this.chainId, this.provider);
    if (detailsWithPermits.length) {
      const permitExecution = permitHandler.getRouterExecution(
        detailsWithPermits.map((d) => d.permit!)
      );

      preTxs.push({
        kind: "permit",
        txData: {
          from: taker,
          to: this.contracts.router.address,
          data:
            this.contracts.router.interface.encodeFunctionData("execute", [[permitExecution]]) +
            generateSourceBytes(options?.source),
        },
        orderIds: detailsWithPermits.map((d) => d.orderId),
      });
    }

    // Batch fill all protected offers in a single transaction
    if (protectedSeaportV15Offers.length) {
      const approvals: NFTApproval[] = [];
      const batch: {
        orders: Sdk.SeaportBase.Types.AdvancedOrder[];
        criteriaResolvers: Sdk.SeaportBase.Types.CriteriaResolver[];
        fulfillments: Sdk.SeaportBase.Types.MatchOrdersFulfillment[];
      } = {
        orders: [],
        criteriaResolvers: [],
        fulfillments: [],
      };

      for (let i = 0; i < protectedSeaportV15Offers.length; i++) {
        const { detail, order, fees, criteriaResolvers, extraData } = protectedSeaportV15Offers[i];

        const contract = detail.contract;
        const owner = taker;
        const operator = new Sdk.SeaportBase.ConduitController(this.chainId).deriveConduit(
          Sdk.SeaportBase.Addresses.OpenseaConduitKey[this.chainId]
        );

        const { order: counterOrder, fulfillments } = constructOfferCounterOrderAndFulfillments(
          order.params,
          taker,
          {
            counter: await new Sdk.SeaportV15.Exchange(this.chainId).getCounter(
              this.provider,
              taker
            ),
            tips: fees,
            tokenId: detail.tokenId,
          }
        );

        batch.orders.push(
          {
            parameters: {
              ...order.params,
              totalOriginalConsiderationItems: order.params.consideration.length,
            },
            signature: order.params.signature!,
            extraData,
            numerator: String(detail.amount ?? 1),
            denominator: order.params.consideration[0].startAmount,
          },
          {
            parameters: counterOrder.parameters,
            signature: counterOrder.signature,
            extraData: "0x",
            numerator: String(detail.amount ?? 1),
            denominator: order.params.consideration[0].startAmount,
          }
        );

        // All `orderIndex` fields must be adjusted
        batch.criteriaResolvers.push(
          ...criteriaResolvers.map((cr) => ({
            ...cr,
            orderIndex: cr.orderIndex + i * 2,
          }))
        );
        batch.fulfillments.push(
          ...fulfillments.map((f) => ({
            offerComponents: f.offerComponents.map((c) => ({
              ...c,
              orderIndex: c.orderIndex + i * 2,
            })),
            considerationComponents: f.considerationComponents.map((c) => ({
              ...c,
              orderIndex: c.orderIndex + i * 2,
            })),
          }))
        );

        approvals.push({
          orderIds: [detail.orderId],
          contract,
          owner,
          operator,
          txData: generateNFTApprovalTxData(contract, owner, operator),
        });
      }

      const calldata = new Interface(SeaportV15Abi).encodeFunctionData("matchAdvancedOrders", [
        batch.orders,
        batch.criteriaResolvers,
        batch.fulfillments,
        taker,
      ]);

      // Fill directly
      txs.push({
        txTags: {
          bids: { "seaport-v1.5": protectedSeaportV15Offers.length },
        },
        txData: {
          from: taker,
          to: Sdk.SeaportV15.Addresses.Exchange[this.chainId],
          data: calldata + generateSourceBytes(options?.source),
        },
        // Ensure approvals are unique
        approvals: uniqBy(
          // TODO: Exclude approvals for unsuccessful items
          approvals,
          ({ txData: { from, to, data } }) => `${from}-${to}-${data}`
        ),
        preSignatures: [],
        orderIds: protectedSeaportV15Offers.map(({ detail }) => detail.orderId),
      });
    }

    if (executionsWithDetails.length === 1 && !options?.forceApprovalProxy) {
      const execution = executionsWithDetails[0].execution;
      const detail = executionsWithDetails[0].detail;
      const routerLevelTxData = this.contracts.router.interface.encodeFunctionData("execute", [
        [execution],
      ]);

      // Use the on-received ERC721/ERC1155 hooks for approval-less bid filling
      if (detail.contractKind === "erc721") {
        txs.push({
          txData: {
            from: taker,
            to: detail.contract,
            data:
              new Interface(ERC721Abi).encodeFunctionData(
                "safeTransferFrom(address,address,uint256,bytes)",
                [taker, execution.module, detail.tokenId, routerLevelTxData]
              ) + generateSourceBytes(options?.source),
          },
          txTags: routerTxTags,
          approvals: [],
          preSignatures: [],
          orderIds: [detail.orderId],
        });
      } else {
        txs.push({
          txData: {
            from: taker,
            to: detail.contract,
            data:
              new Interface(ERC1155Abi).encodeFunctionData(
                "safeTransferFrom(address,address,uint256,uint256,bytes)",
                [taker, execution.module, detail.tokenId, detail.amount ?? 1, routerLevelTxData]
              ) + generateSourceBytes(options?.source),
          },
          txTags: routerTxTags,
          approvals: [],
          preSignatures: [],
          orderIds: [detail.orderId],
        });
      }
    } else if (executionsWithDetails.length >= 1) {
      txs.push({
        txData: {
          from: taker,
          to: this.contracts.approvalProxy.address,
          data:
            this.contracts.approvalProxy.interface.encodeFunctionData("bulkTransferWithExecute", [
              nftTransferItems,
              [...executionsWithDetails.map(({ execution }) => execution)],
              Sdk.SeaportBase.Addresses.ReservoirConduitKey[this.chainId],
            ]) + generateSourceBytes(options?.source),
        },
        txTags: routerTxTags,
        // Ensure approvals are unique
        approvals: uniqBy(
          // TODO: Exclude approvals for unsuccessful items
          approvals,
          ({ txData: { from, to, data } }) => `${from}-${to}-${data}`
        ),
        preSignatures: [],
        orderIds: executionsWithDetails.map(({ detail }) => detail.orderId),
      });
    }

    if (!txs.length) {
      throw new Error("Could not fill any of the requested orders");
    }

    return {
      preTxs,
      txs,
      success,
    };
  }

  public async transfersTx(
    transferItem: ApprovalProxy.TransferItem,
    sender: string
  ): Promise<TransfersResult> {
    const useOpenseaTransferHelper = Sdk.Common.Addresses.OpenseaTransferHelper[this.chainId];

    const conduitKey = useOpenseaTransferHelper
      ? Sdk.SeaportBase.Addresses.OpenseaConduitKey[this.chainId]
      : Sdk.SeaportBase.Addresses.ReservoirConduitKey[this.chainId];
    const conduit = new ConduitController(this.chainId).deriveConduit(conduitKey);

    const approvals = transferItem.items.map((item) => ({
      orderIds: [],
      contract: item.token,
      owner: sender,
      operator: conduit,
      txData: generateNFTApprovalTxData(item.token, sender, conduit),
    }));
    // Ensure approvals are unique
    const uniqueApprovals = uniqBy(
      approvals,
      ({ txData: { from, to, data } }) => `${from}-${to}-${data}`
    );

    if (useOpenseaTransferHelper) {
      return {
        txs: [
          {
            approvals: uniqueApprovals,
            txData: {
              from: sender,
              to: Sdk.Common.Addresses.OpenseaTransferHelper[this.chainId],
              data: new Interface(OpenseaTransferHelperAbi).encodeFunctionData("bulkTransfer", [
                [
                  {
                    ...transferItem,
                    items: transferItem.items.map((item) => ({
                      ...item,
                      validateERC721Receiver: true,
                    })),
                  },
                ],
                conduitKey,
              ]),
            },
          },
        ],
      };
    } else {
      return {
        txs: [
          {
            approvals: uniqueApprovals,
            txData: {
              from: sender,
              to: Addresses.ApprovalProxy[this.chainId],
              data: this.contracts.approvalProxy.interface.encodeFunctionData(
                "bulkTransferWithExecute",
                [[transferItem], [], conduitKey]
              ),
            },
          },
        ],
      };
    }
  }
}
