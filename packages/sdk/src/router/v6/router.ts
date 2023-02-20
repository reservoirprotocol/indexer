import { Interface } from "@ethersproject/abi";
import { Provider } from "@ethersproject/abstract-provider";
import { BigNumberish } from "@ethersproject/bignumber";
import { AddressZero } from "@ethersproject/constants";
import { Contract } from "@ethersproject/contracts";
import axios from "axios";

import * as Addresses from "./addresses";
import * as SeaportPermit from "./permits/seaport";
import * as UniswapPermit from "./permits/permit2";

import {
  BidDetails,
  ExecutionInfo,
  Fee,
  FTApproval,
  FTPermit,
  ListingDetails,
  ListingDetailsExtracted,
  ListingFillDetails,
  NFTApproval,
  NFTPermit,
  PerCurrencyDetails,
} from "./types";
import { generateSwapExecutions } from "./uniswap";
import {
  generateFTApprovalTxData,
  generateNFTApprovalTxData,
  isETH,
} from "./utils";
import * as Sdk from "../../index";
import { encodeForMatchOrders } from "../../rarible/utils";
import { TxData, bn, generateSourceBytes, uniqBy } from "../../utils";

// Tokens
import ERC721Abi from "../../common/abis/Erc721.json";
import ERC1155Abi from "../../common/abis/Erc1155.json";
// Router
import RouterAbi from "./abis/ReservoirV6_0_0.json";
// Modules
import BlurModuleAbi from "./abis/BlurModule.json";
import ElementModuleAbi from "./abis/ElementModule.json";
import FoundationModuleAbi from "./abis/FoundationModule.json";
import LooksRareModuleAbi from "./abis/LooksRareModule.json";
import NFTXModuleAbi from "./abis/NFTXModule.json";
import Permit2ModuleAbi from "./abis/Permit2Module.json";
import RaribleModuleAbi from "./abis/RaribleModule.json";
import SeaportModuleAbi from "./abis/SeaportModule.json";
import SeaportV12ModuleAbi from "./abis/SeaportV12Module.json";
import SudoswapModuleAbi from "./abis/SudoswapModule.json";
import UniswapV3ModuleAbi from "./abis/UniswapV3Module.json";
import WETHModuleAbi from "./abis/WETHModule.json";
import X2Y2ModuleAbi from "./abis/X2Y2Module.json";
import ZeroExV4ModuleAbi from "./abis/ZeroExV4Module.json";
import ZoraModuleAbi from "./abis/ZoraModule.json";

type SetupOptions = {
  x2y2ApiKey?: string;
  cbApiKey?: string;
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
      router: new Contract(Addresses.Router[chainId], RouterAbi, provider),
      // Initialize modules
      blurModule: new Contract(
        Addresses.BlurModule[chainId] ?? AddressZero,
        BlurModuleAbi,
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
      looksRareModule: new Contract(
        Addresses.LooksRareModule[chainId] ?? AddressZero,
        LooksRareModuleAbi,
        provider
      ),
      seaportModule: new Contract(
        Addresses.SeaportModule[chainId] ?? AddressZero,
        SeaportModuleAbi,
        provider
      ),
      seaportV12Module: new Contract(
        Addresses.SeaportV12Module[chainId] ?? AddressZero,
        SeaportV12ModuleAbi,
        provider
      ),
      sudoswapModule: new Contract(
        Addresses.SudoswapModule[chainId] ?? AddressZero,
        SudoswapModuleAbi,
        provider
      ),
      uniswapV3Module: new Contract(
        Addresses.UniswapV3Module[chainId] ?? AddressZero,
        UniswapV3ModuleAbi,
        provider
      ),
      wethModule: new Contract(
        Addresses.WETHModule[chainId] ?? AddressZero,
        WETHModuleAbi,
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
      raribleModule: new Contract(
        Addresses.RaribleModule[chainId] ?? AddressZero,
        RaribleModuleAbi,
        provider
      ),
      permit2Module: new Contract(
        Addresses.Permit2Module[chainId] ?? AddressZero,
        Permit2ModuleAbi,
        provider
      ),
    };
  }

  public async fillListingsTx(
    details: ListingDetails[],
    taker: string,
    buyInCurrency = Sdk.Common.Addresses.Eth[this.chainId],
    options?: {
      source?: string;
      // Will be split among all listings to get filled
      globalFees?: Fee[];
      // Include a balance assert module call for every listing
      assertBalances?: boolean;
      // Force filling through the router (where possible)
      forceRouter?: boolean;
      // Skip any errors (either off-chain or on-chain)
      partial?: boolean;
      // Any extra data relevant when filling natively
      directFillingData?: any;
      // Wallet used for relaying the fill transaction
      relayer?: string;
    }
  ): Promise<{
    txData: TxData;
    success: boolean[];
    approvals: FTApproval[];
    permits: FTPermit[];
  }> {
    // Assume the listing details are consistent with the underlying order object

    // TODO: Add support for balance assertions
    if (options?.assertBalances) {
      throw new Error("Balance assertions not yet implemented");
    }

    // TODO: Add Universe router module
    if (details.some(({ kind }) => kind === "universe")) {
      if (options?.relayer) {
        throw new Error("Relayer not supported");
      }

      if (details.length > 1) {
        throw new Error("Universe sweeping is not supported");
      } else {
        if (options?.globalFees?.length) {
          throw new Error("Fees not supported");
        }

        const detail = details[0];

        let approval: FTApproval | undefined;
        if (!isETH(this.chainId, detail.currency)) {
          approval = {
            currency: detail.currency,
            owner: taker,
            operator: Sdk.Universe.Addresses.Exchange[this.chainId],
            txData: generateFTApprovalTxData(
              detail.currency,
              taker,
              Sdk.Universe.Addresses.Exchange[this.chainId]
            ),
          };
        }

        const order = detail.order as Sdk.Universe.Order;
        const exchange = new Sdk.Universe.Exchange(this.chainId);
        return {
          txData: await exchange.fillOrderTx(taker, order, {
            amount: Number(detail.amount),
            source: options?.source,
          }),
          success: [true],
          approvals: approval ? [approval] : [],
          permits: [],
        };
      }
    }

    // TODO: Add Cryptopunks router module
    if (details.some(({ kind }) => kind === "cryptopunks")) {
      if (options?.relayer) {
        throw new Error("Relayer not supported");
      }

      if (details.length > 1) {
        throw new Error("Cryptopunks sweeping is not supported");
      } else {
        if (options?.globalFees?.length) {
          throw new Error("Fees not supported");
        }

        const detail = details[0];

        const order = detail.order as Sdk.CryptoPunks.Order;
        const exchange = new Sdk.CryptoPunks.Exchange(this.chainId);
        return {
          txData: exchange.fillListingTx(taker, order, options),
          success: [true],
          approvals: [],
          permits: [],
        };
      }
    }

    // TODO: Add Infinity router module
    if (details.some(({ kind }) => kind === "infinity")) {
      if (options?.relayer) {
        throw new Error("Relayer not supported");
      }

      if (details.length > 1) {
        throw new Error("Infinity sweeping is not supported");
      } else {
        if (options?.globalFees?.length) {
          throw new Error("Fees not supported");
        }

        const detail = details[0];

        let approval: FTApproval | undefined;
        if (!isETH(this.chainId, detail.currency)) {
          approval = {
            currency: detail.currency,
            owner: taker,
            operator: Sdk.Infinity.Addresses.Exchange[this.chainId],
            txData: generateFTApprovalTxData(
              detail.currency,
              taker,
              Sdk.Infinity.Addresses.Exchange[this.chainId]
            ),
          };
        }

        const order = detail.order as Sdk.Infinity.Order;
        const exchange = new Sdk.Infinity.Exchange(this.chainId);

        if (options?.directFillingData) {
          return {
            txData: exchange.takeOrdersTx(taker, [
              {
                order,
                tokens: options.directFillingData,
              },
            ]),
            success: [true],
            approvals: approval ? [approval] : [],
            permits: [],
          };
        }
        return {
          txData: exchange.takeMultipleOneOrdersTx(taker, [order]),
          success: [true],
          approvals: approval ? [approval] : [],
          permits: [],
        };
      }
    }

    // TODO: Add Flow router module
    if (details.some(({ kind }) => kind === "flow")) {
      if (options?.relayer) {
        throw new Error("Relayer not supported");
      }

      if (details.length > 1) {
        throw new Error("Flow sweeping is not supported");
      } else {
        if (options?.globalFees?.length) {
          throw new Error("Fees not supported");
        }

        const detail = details[0];

        let approval: FTApproval | undefined;
        if (!isETH(this.chainId, detail.currency)) {
          approval = {
            currency: detail.currency,
            owner: taker,
            operator: Sdk.Flow.Addresses.Exchange[this.chainId],
            txData: generateNFTApprovalTxData(
              detail.currency,
              taker,
              Sdk.Flow.Addresses.Exchange[this.chainId]
            ),
          };
        }

        const order = detail.order as Sdk.Flow.Order;
        const exchange = new Sdk.Flow.Exchange(this.chainId);

        if (options?.directFillingData) {
          return {
            txData: exchange.takeOrdersTx(taker, [
              {
                order,
                tokens: options.directFillingData,
              },
            ]),
            success: [true],
            approvals: approval ? [approval] : [],
            permits: [],
          };
        }
        return {
          txData: exchange.takeMultipleOneOrdersTx(taker, [order]),
          success: [true],
          approvals: approval ? [approval] : [],
          permits: [],
        };
      }
    }

    // TODO: Add Manifold router module
    if (details.some(({ kind }) => kind === "manifold")) {
      if (options?.relayer) {
        throw new Error("Relayer not supported");
      }

      if (details.length > 1) {
        throw new Error("Manifold sweeping is not supported");
      } else {
        if (options?.globalFees?.length) {
          throw new Error("Fees not supported");
        }

        const detail = details[0];

        const order = detail.order as Sdk.Manifold.Order;
        const exchange = new Sdk.Manifold.Exchange(this.chainId);

        const amountFilled = Number(detail.amount) ?? 1;
        const orderPrice = bn(order.params.details.initialAmount)
          .mul(amountFilled)
          .toString();

        return {
          txData: exchange.fillOrderTx(
            taker,
            Number(order.params.id),
            amountFilled,
            orderPrice,
            options
          ),
          success: [true],
          approvals: [],
          permits: [],
        };
      }
    }

    // Handle partial seaport orders:
    // - fetch the full order data for each partial order (concurrently)
    // - remove any partial order from the details

    await Promise.all(
      details
        .filter(({ kind }) => kind === "seaport-partial")
        .map(async (detail) => {
          try {
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
          } catch {
            if (!options?.partial) {
              throw new Error("Could not generate fill data");
            } else {
              return;
            }
          }
        })
    );
    details = details.filter(({ kind }) => kind !== "seaport-partial");

    await Promise.all(
      details
        .filter(({ kind }) => kind === "seaport-v1.2-partial")
        .map(async (detail) => {
          try {
            const order = detail.order as Sdk.SeaportV12.Types.PartialOrder;
            const result = await axios.get(
              `https://order-fetcher.vercel.app/api/listing?orderHash=${order.id}&contract=${order.contract}&tokenId=${order.tokenId}&taker=${taker}&chainId=${this.chainId}`
            );

            const fullOrder = new Sdk.SeaportV12.Order(
              this.chainId,
              result.data.order
            );
            details.push({
              ...detail,
              kind: "seaport-v1.2",
              order: fullOrder,
            });
          } catch {
            if (!options?.partial) {
              throw new Error("Could not generate fill data");
            } else {
              return;
            }
          }
        })
    );
    details = details.filter(({ kind }) => kind !== "seaport-v1.2-partial");

    const relayer = options?.relayer ?? taker;

    // If all orders are Seaport, then fill on Seaport directly
    // TODO: Directly fill for other exchanges as well

    if (
      details.every(
        ({ kind, fees, currency, order }) =>
          kind === "seaport" &&
          buyInCurrency === currency &&
          // All orders must have the same currency and conduit
          currency === details[0].currency &&
          (order as Sdk.Seaport.Order).params.conduitKey ===
            (details[0].order as Sdk.Seaport.Order).params.conduitKey &&
          !fees?.length
      ) &&
      !options?.globalFees?.length &&
      !options?.forceRouter &&
      !options?.relayer
    ) {
      const exchange = new Sdk.Seaport.Exchange(this.chainId);

      const conduit = exchange.deriveConduit(
        (details[0].order as Sdk.Seaport.Order).params.conduitKey
      );

      let approval: FTApproval | undefined;
      if (!isETH(this.chainId, details[0].currency)) {
        approval = {
          currency: details[0].currency,
          owner: taker,
          operator: conduit,
          txData: generateFTApprovalTxData(details[0].currency, taker, conduit),
        };
      }

      if (details.length === 1) {
        const order = details[0].order as Sdk.Seaport.Order;
        return {
          txData: await exchange.fillOrderTx(
            taker,
            order,
            order.buildMatching({ amount: details[0].amount }),
            {
              ...options,
              ...options?.directFillingData,
            }
          ),
          success: [true],
          approvals: approval ? [approval] : [],
          permits: [],
        };
      } else {
        const orders = details.map((d) => d.order as Sdk.Seaport.Order);
        return {
          txData: await exchange.fillOrdersTx(
            taker,
            orders,
            orders.map((order, i) =>
              order.buildMatching({ amount: details[i].amount })
            ),
            {
              ...options,
              ...options?.directFillingData,
            }
          ),
          success: orders.map((_) => true),
          approvals: approval ? [approval] : [],
          permits: [],
        };
      }
    }

    if (
      details.every(
        ({ kind, fees, currency, order }) =>
          kind === "seaport-v1.2" &&
          buyInCurrency === currency &&
          // All orders must have the same currency and conduit
          currency === details[0].currency &&
          (order as Sdk.SeaportV12.Order).params.conduitKey ===
            (details[0].order as Sdk.SeaportV12.Order).params.conduitKey &&
          !fees?.length
      ) &&
      !options?.globalFees?.length &&
      !options?.forceRouter &&
      !options?.relayer
    ) {
      const exchange = new Sdk.SeaportV12.Exchange(this.chainId);

      const conduit = exchange.deriveConduit(
        (details[0].order as Sdk.Seaport.Order).params.conduitKey
      );

      let approval: FTApproval | undefined;
      if (!isETH(this.chainId, details[0].currency)) {
        approval = {
          currency: details[0].currency,
          owner: taker,
          operator: conduit,
          txData: generateFTApprovalTxData(details[0].currency, taker, conduit),
        };
      }

      if (details.length === 1) {
        const order = details[0].order as Sdk.SeaportV12.Order;
        return {
          txData: await exchange.fillOrderTx(
            taker,
            order,
            order.buildMatching({ amount: details[0].amount }),
            {
              ...options,
              ...options?.directFillingData,
            }
          ),
          success: [true],
          approvals: approval ? [approval] : [],
          permits: [],
        };
      } else {
        const orders = details.map((d) => d.order as Sdk.SeaportV12.Order);
        return {
          txData: await exchange.fillOrdersTx(
            taker,
            orders,
            orders.map((order, i) =>
              order.buildMatching({ amount: details[i].amount })
            ),
            {
              ...options,
              ...options?.directFillingData,
            }
          ),
          success: orders.map((_) => true),
          approvals: approval ? [approval] : [],
          permits: [],
        };
      }
    }

    const buyInETH = isETH(this.chainId, buyInCurrency);
    if (!buyInETH) {
      const allSeaport = details.every((c) =>
        ["seaport", "seaport-v1.2"].includes(c.kind)
      );
      if (!allSeaport) {
        throw new Error("Unsupported buy-in currency");
      }
    }

    const getFees = (ownDetails: ListingFillDetails[]) => [
      // Global fees
      ...(options?.globalFees ?? [])
        .filter(
          ({ amount, recipient }) =>
            // Skip zero amounts and/or recipients
            bn(amount).gt(0) && recipient !== AddressZero
        )
        .map(({ recipient, amount }) => ({
          recipient,
          // The fees are averaged over the number of listings to fill
          // TODO: Also take into account the quantity filled for ERC1155
          amount: bn(amount).mul(ownDetails.length).div(details.length),
        })),
      // Local fees
      // TODO: Should not split the local fees among all executions
      ...ownDetails.flatMap(({ fees }) =>
        (fees ?? []).filter(
          ({ amount, recipient }) =>
            // Skip zero amounts and/or recipients
            bn(amount).gt(0) && recipient !== AddressZero
        )
      ),
    ];

    // Keep track of any approvals that might be needed
    const approvals: FTApproval[] = [];

    // Keep track of the tokens needed by each module
    const permitItems: UniswapPermit.TransferDetail[] = [];

    // Split all listings by their kind
    const blurDetails: ListingDetailsExtracted[] = [];
    const elementErc721Details: ListingDetailsExtracted[] = [];
    const elementErc721V2Details: ListingDetailsExtracted[] = [];
    const elementErc1155Details: ListingDetailsExtracted[] = [];
    const foundationDetails: ListingDetailsExtracted[] = [];
    const looksRareDetails: ListingDetailsExtracted[] = [];
    const seaportDetails: PerCurrencyDetails = {};
    const seaportV12Details: PerCurrencyDetails = {};
    const sudoswapDetails: ListingDetailsExtracted[] = [];
    const x2y2Details: ListingDetailsExtracted[] = [];
    const zeroexV4Erc721Details: ListingDetailsExtracted[] = [];
    const zeroexV4Erc1155Details: ListingDetailsExtracted[] = [];
    const zoraDetails: ListingDetailsExtracted[] = [];
    const nftxDetails: ListingDetailsExtracted[] = [];
    const raribleDetails: ListingDetailsExtracted[] = [];
    for (let i = 0; i < details.length; i++) {
      const { kind, contractKind, currency } = details[i];

      let detailsRef: ListingDetailsExtracted[];
      switch (kind) {
        case "blur":
          detailsRef = blurDetails;
          break;

        case "element": {
          const order = details[i].order as Sdk.Element.Order;
          detailsRef = order.isBatchSignedOrder()
            ? elementErc721V2Details
            : contractKind === "erc721"
            ? elementErc721Details
            : elementErc1155Details;
          break;
        }

        case "foundation":
          detailsRef = foundationDetails;
          break;

        case "looks-rare":
          detailsRef = looksRareDetails;
          break;

        case "seaport":
          if (!seaportDetails[currency]) {
            seaportDetails[currency] = [];
          }
          detailsRef = seaportDetails[currency];
          break;

        case "seaport-v1.2":
          if (!seaportV12Details[currency]) {
            seaportV12Details[currency] = [];
          }
          detailsRef = seaportV12Details[currency];
          break;

        case "sudoswap":
          detailsRef = sudoswapDetails;
          break;

        case "x2y2":
          detailsRef = x2y2Details;
          break;

        case "zeroex-v4":
          detailsRef =
            contractKind === "erc721"
              ? zeroexV4Erc721Details
              : zeroexV4Erc1155Details;
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

        default:
          throw new Error("Unsupported exchange kind");
      }

      detailsRef.push({ ...details[i], originalIndex: i });
    }

    // Generate router executions
    const executions: ExecutionInfo[] = [];
    const success: boolean[] = details.map(() => false);

    // Handle Blur listings
    if (blurDetails.length) {
      const orders = blurDetails.map((d) => d.order as Sdk.Blur.Order);
      const module = this.contracts.blurModule.address;

      const fees = getFees(blurDetails);

      const totalPrice = orders
        .map((order) => bn(order.params.price))
        .reduce((a, b) => a.add(b), bn(0));
      const totalFees = fees
        .map(({ amount }) => bn(amount))
        .reduce((a, b) => a.add(b), bn(0));

      executions.push({
        module,
        data:
          orders.length === 1
            ? this.contracts.blurModule.interface.encodeFunctionData(
                "acceptETHListing",
                [
                  orders[0].getRaw(),
                  orders[0].buildMatching({
                    trader: module,
                  }),
                  {
                    fillTo: taker,
                    refundTo: taker,
                    revertIfIncomplete: Boolean(!options?.partial),
                    amount: totalPrice,
                  },
                  fees,
                ]
              )
            : this.contracts.blurModule.interface.encodeFunctionData(
                "acceptETHListings",
                [
                  orders.map((order) => order.getRaw()),
                  orders.map((order) =>
                    order.buildMatching({
                      trader: module,
                    })
                  ),
                  {
                    fillTo: taker,
                    refundTo: taker,
                    revertIfIncomplete: Boolean(!options?.partial),
                    amount: totalPrice,
                  },
                  fees,
                ]
              ),
        value: totalPrice.add(totalFees),
      });

      // Mark the listings as successfully handled
      for (const { originalIndex } of blurDetails) {
        success[originalIndex] = true;
      }
    }

    // Handle Element ERC721 listings
    if (elementErc721Details.length) {
      const orders = elementErc721Details.map(
        (d) => d.order as Sdk.Element.Order
      );

      const totalPrice = orders
        .map((order) => order.getTotalPrice())
        .reduce((a, b) => a.add(b), bn(0));

      const fees = getFees(elementErc721Details);
      const totalFees = fees
        .map(({ amount }) => bn(amount))
        .reduce((a, b) => a.add(b), bn(0));

      const listingParams = {
        fillTo: taker,
        refundTo: taker,
        revertIfIncomplete: Boolean(!options?.partial),
        amount: totalPrice,
      };
      const module = this.contracts.elementModule;

      executions.push({
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
        value: totalPrice.add(totalFees),
      });

      // Mark the listings as successfully handled
      for (const { originalIndex } of elementErc721Details) {
        success[originalIndex] = true;
      }
    }

    // Handle Element ERC721 listings V2
    if (elementErc721V2Details.length) {
      const orders = elementErc721V2Details.map(
        (d) => d.order as Sdk.Element.Order
      );

      const totalPrice = orders
        .map((order) => order.getTotalPrice())
        .reduce((a, b) => a.add(b), bn(0));

      const fees = getFees(elementErc721V2Details);
      const totalFees = fees
        .map(({ amount }) => bn(amount))
        .reduce((a, b) => a.add(b), bn(0));

      const listingParams = {
        fillTo: taker,
        refundTo: taker,
        revertIfIncomplete: Boolean(!options?.partial),
        amount: totalPrice,
      };
      const module = this.contracts.elementModule;

      executions.push({
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
        value: totalPrice.add(totalFees),
      });

      // Mark the listings as successfully handled
      for (const { originalIndex } of elementErc721V2Details) {
        success[originalIndex] = true;
      }
    }

    // Handle Element ERC1155 listings
    if (elementErc1155Details.length) {
      const orders = elementErc1155Details.map(
        (d) => d.order as Sdk.Element.Order
      );

      const totalPrice = orders
        .map((order, i) =>
          order.getTotalPrice(elementErc1155Details[i].amount ?? 1)
        )
        .reduce((a, b) => a.add(b), bn(0));

      const fees = getFees(elementErc1155Details);
      const totalFees = fees
        .map(({ amount }) => bn(amount))
        .reduce((a, b) => a.add(b), bn(0));

      const listingParams = {
        fillTo: taker,
        refundTo: taker,
        revertIfIncomplete: Boolean(!options?.partial),
        amount: totalPrice,
      };
      const module = this.contracts.elementModule;

      executions.push({
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
        value: totalPrice.add(totalFees),
      });

      // Mark the listings as successfully handled
      for (const { originalIndex } of elementErc1155Details) {
        success[originalIndex] = true;
      }
    }

    // Handle Foundation listings
    if (foundationDetails.length) {
      const orders = foundationDetails.map(
        (d) => d.order as Sdk.Foundation.Order
      );
      const fees = getFees(foundationDetails);

      const totalPrice = orders
        .map((order) => bn(order.params.price))
        .reduce((a, b) => a.add(b), bn(0));
      const totalFees = fees
        .map(({ amount }) => bn(amount))
        .reduce((a, b) => a.add(b), bn(0));

      executions.push({
        module: this.contracts.foundationModule.address,
        data:
          orders.length === 1
            ? this.contracts.foundationModule.interface.encodeFunctionData(
                "acceptETHListing",
                [
                  {
                    ...orders[0].params,
                    token: orders[0].params.contract,
                  },
                  {
                    fillTo: taker,
                    refundTo: taker,
                    revertIfIncomplete: Boolean(!options?.partial),
                    amount: totalPrice,
                  },
                  fees,
                ]
              )
            : this.contracts.foundationModule.interface.encodeFunctionData(
                "acceptETHListings",
                [
                  orders.map((order) => ({
                    ...order.params,
                    token: order.params.contract,
                  })),
                  {
                    fillTo: taker,
                    refundTo: taker,
                    revertIfIncomplete: Boolean(!options?.partial),
                    amount: totalPrice,
                  },
                  fees,
                ]
              ),
        value: totalPrice.add(totalFees),
      });

      // Mark the listings as successfully handled
      for (const { originalIndex } of foundationDetails) {
        success[originalIndex] = true;
      }
    }

    // Handle LooksRare listings
    if (looksRareDetails.length) {
      const orders = looksRareDetails.map(
        (d) => d.order as Sdk.LooksRare.Order
      );
      const module = this.contracts.looksRareModule.address;

      const fees = getFees(looksRareDetails);

      const totalPrice = orders
        .map((order) => bn(order.params.price))
        .reduce((a, b) => a.add(b), bn(0));
      const totalFees = fees
        .map(({ amount }) => bn(amount))
        .reduce((a, b) => a.add(b), bn(0));

      executions.push({
        module,
        data:
          orders.length === 1
            ? this.contracts.looksRareModule.interface.encodeFunctionData(
                "acceptETHListing",
                [
                  orders[0].buildMatching(
                    // For LooksRare, the module acts as the taker proxy
                    module
                  ),
                  orders[0].params,
                  {
                    fillTo: taker,
                    refundTo: taker,
                    revertIfIncomplete: Boolean(!options?.partial),
                    amount: totalPrice,
                  },
                  fees,
                ]
              )
            : this.contracts.looksRareModule.interface.encodeFunctionData(
                "acceptETHListings",
                [
                  orders.map((order) =>
                    order.buildMatching(
                      // For LooksRare, the module acts as the taker proxy
                      module
                    )
                  ),
                  orders.map((order) => order.params),
                  {
                    fillTo: taker,
                    refundTo: taker,
                    revertIfIncomplete: Boolean(!options?.partial),
                    amount: totalPrice,
                  },
                  fees,
                ]
              ),
        value: totalPrice.add(totalFees),
      });

      // Mark the listings as successfully handled
      for (const { originalIndex } of looksRareDetails) {
        success[originalIndex] = true;
      }
    }

    // Handle Seaport listings
    if (Object.keys(seaportDetails).length) {
      const exchange = new Sdk.Seaport.Exchange(this.chainId);
      for (const currency of Object.keys(seaportDetails)) {
        const currencyDetails = seaportDetails[currency];

        const orders = currencyDetails.map((d) => d.order as Sdk.Seaport.Order);
        const fees = getFees(currencyDetails);

        const totalPrice = orders
          .map((order, i) =>
            // Seaport orders can be partially-fillable
            bn(order.getMatchingPrice())
              .mul(currencyDetails[i].amount ?? 1)
              .div(order.getInfo()!.amount)
          )
          .reduce((a, b) => a.add(b), bn(0));
        const totalFees = fees
          .map(({ amount }) => bn(amount))
          .reduce((a, b) => a.add(b), bn(0));
        const totalPayment = totalPrice.add(totalFees);

        let skipFillExecution = false;
        try {
          let permitTo = this.contracts.seaportModule.address;

          let swapExecutions: ExecutionInfo[] | undefined;
          let amountIn: BigNumberish | undefined;
          if (buyInCurrency !== currency) {
            ({ executions: swapExecutions, amountIn } =
              await generateSwapExecutions(
                this.chainId,
                this.provider,
                buyInCurrency,
                currency,
                totalPayment,
                {
                  uniswapV3Module: this.contracts.uniswapV3Module,
                  wethModule: this.contracts.wethModule,
                  // Forward any swapped tokens to the Seaport module
                  recipient: this.contracts.seaportModule.address,
                  refundTo: relayer,
                }
              ));

            permitTo = this.contracts.uniswapV3Module.address;
          }

          if (!buyInETH) {
            approvals.push({
              currency: buyInCurrency,
              owner: relayer,
              operator: Sdk.Common.Addresses.Permit2[this.chainId],
              txData: generateFTApprovalTxData(
                buyInCurrency,
                relayer,
                Sdk.Common.Addresses.Permit2[this.chainId]
              ),
            });
            permitItems.push({
              from: relayer,
              to: permitTo,
              token: buyInCurrency,
              amount: (amountIn ?? totalPayment).toString(),
            });
          }

          if (swapExecutions) {
            executions.push(...swapExecutions);
          }
        } catch {
          if (!options?.partial) {
            throw new Error("Could not generate swap execution");
          } else {
            // Since the swap execution generation failed, we should also skip the fill execution
            skipFillExecution = true;
          }
        }

        const currencyIsETH = isETH(this.chainId, currency);
        const buyInCurrencyIsETH = isETH(this.chainId, buyInCurrency);
        if (!skipFillExecution) {
          executions.push({
            module: this.contracts.seaportModule.address,
            data:
              orders.length === 1
                ? this.contracts.seaportModule.interface.encodeFunctionData(
                    `accept${currencyIsETH ? "ETH" : "ERC20"}Listing`,
                    [
                      {
                        parameters: {
                          ...orders[0].params,
                          totalOriginalConsiderationItems:
                            orders[0].params.consideration.length,
                        },
                        numerator: currencyDetails[0].amount ?? 1,
                        denominator: orders[0].getInfo()!.amount,
                        signature: orders[0].params.signature,
                        extraData: await exchange.getExtraData(orders[0]),
                      },
                      {
                        fillTo: taker,
                        refundTo: taker,
                        revertIfIncomplete: Boolean(!options?.partial),
                        // Only needed for ERC20 listings
                        token: currency,
                        amount: totalPrice,
                      },
                      fees,
                    ]
                  )
                : this.contracts.seaportModule.interface.encodeFunctionData(
                    `accept${currencyIsETH ? "ETH" : "ERC20"}Listings`,
                    [
                      await Promise.all(
                        orders.map(async (order, i) => {
                          const orderData = {
                            parameters: {
                              ...order.params,
                              totalOriginalConsiderationItems:
                                order.params.consideration.length,
                            },
                            numerator: currencyDetails[i].amount ?? 1,
                            denominator: order.getInfo()!.amount,
                            signature: order.params.signature,
                            extraData: await exchange.getExtraData(order),
                          };

                          if (currencyIsETH) {
                            return {
                              order: orderData,
                              price: orders[i].getMatchingPrice(),
                            };
                          } else {
                            return orderData;
                          }
                        })
                      ),
                      {
                        fillTo: taker,
                        refundTo: taker,
                        revertIfIncomplete: Boolean(!options?.partial),
                        // Only needed for ERC20 listings
                        token: currency,
                        amount: totalPrice,
                      },
                      fees,
                    ]
                  ),
            value: buyInCurrencyIsETH && currencyIsETH ? totalPayment : 0,
          });

          // Mark the listings as successfully handled
          for (const { originalIndex } of currencyDetails) {
            success[originalIndex] = true;
          }
        }
      }
    }

    // Handle Seaport V1.2 listings
    if (Object.keys(seaportV12Details).length) {
      const exchange = new Sdk.SeaportV12.Exchange(this.chainId);
      for (const currency of Object.keys(seaportV12Details)) {
        const currencyDetails = seaportV12Details[currency];

        const orders = currencyDetails.map(
          (d) => d.order as Sdk.SeaportV12.Order
        );
        const fees = getFees(currencyDetails);

        const totalPrice = orders
          .map((order, i) =>
            // Seaport orders can be partially-fillable
            bn(order.getMatchingPrice())
              .mul(currencyDetails[i].amount ?? 1)
              .div(order.getInfo()!.amount)
          )
          .reduce((a, b) => a.add(b), bn(0));
        const totalFees = fees
          .map(({ amount }) => bn(amount))
          .reduce((a, b) => a.add(b), bn(0));
        const totalPayment = totalPrice.add(totalFees);

        let skipFillExecution = false;

        try {
          let swapExecutions: ExecutionInfo[] | undefined;
          let amountIn: BigNumberish | undefined;
          if (buyInCurrency !== currency) {
            ({ executions: swapExecutions, amountIn } =
              await generateSwapExecutions(
                this.chainId,
                this.provider,
                buyInCurrency,
                currency,
                totalPayment,
                {
                  uniswapV3Module: this.contracts.uniswapV3Module,
                  wethModule: this.contracts.wethModule,
                  // Forward any swapped tokens to the SeaportV12 module
                  recipient: this.contracts.seaportV12Module.address,
                  refundTo: relayer,
                }
              ));
          }

          if (!buyInETH) {
            approvals.push({
              currency: buyInCurrency,
              owner: relayer,
              operator: Sdk.Common.Addresses.Permit2[this.chainId],
              txData: generateFTApprovalTxData(
                buyInCurrency,
                relayer,
                Sdk.Common.Addresses.Permit2[this.chainId]
              ),
            });
            permitItems.push({
              from: relayer,
              to: this.contracts.seaportV12Module.address,
              token: buyInCurrency,
              amount: (amountIn ?? totalPayment).toString(),
            });
          }

          if (swapExecutions) {
            executions.push(...swapExecutions);
          }
        } catch {
          if (!options?.partial) {
            throw new Error("Could not generate swap execution");
          } else {
            // Since the swap execution generation failed, we should also skip the fill execution
            skipFillExecution = true;
          }
        }

        const currencyIsETH = isETH(this.chainId, currency);
        const buyInCurrencyIsETH = isETH(this.chainId, buyInCurrency);
        if (!skipFillExecution) {
          executions.push({
            module: this.contracts.seaportV12Module.address,
            data:
              orders.length === 1
                ? this.contracts.seaportV12Module.interface.encodeFunctionData(
                    `accept${currencyIsETH ? "ETH" : "ERC20"}Listing`,
                    [
                      {
                        parameters: {
                          ...orders[0].params,
                          totalOriginalConsiderationItems:
                            orders[0].params.consideration.length,
                        },
                        numerator: currencyDetails[0].amount ?? 1,
                        denominator: orders[0].getInfo()!.amount,
                        signature: orders[0].params.signature,
                        extraData: await exchange.getExtraData(orders[0]),
                      },
                      {
                        fillTo: taker,
                        refundTo: taker,
                        revertIfIncomplete: Boolean(!options?.partial),
                        // Only needed for ERC20 listings
                        token: currency,
                        amount: totalPrice,
                      },
                      fees,
                    ]
                  )
                : this.contracts.seaportV12Module.interface.encodeFunctionData(
                    `accept${currencyIsETH ? "ETH" : "ERC20"}Listings`,
                    [
                      await Promise.all(
                        orders.map(async (order, i) => {
                          const orderData = {
                            parameters: {
                              ...order.params,
                              totalOriginalConsiderationItems:
                                order.params.consideration.length,
                            },
                            numerator: currencyDetails[i].amount ?? 1,
                            denominator: order.getInfo()!.amount,
                            signature: order.params.signature,
                            extraData: await exchange.getExtraData(order),
                          };

                          if (currencyIsETH) {
                            return {
                              order: orderData,
                              price: orders[i].getMatchingPrice(),
                            };
                          } else {
                            return orderData;
                          }
                        })
                      ),
                      {
                        fillTo: taker,
                        refundTo: taker,
                        revertIfIncomplete: Boolean(!options?.partial),
                        // Only needed for ERC20 listings
                        token: currency,
                        amount: totalPrice,
                      },
                      fees,
                    ]
                  ),
            value: buyInCurrencyIsETH && currencyIsETH ? totalPayment : 0,
          });

          // Mark the listings as successfully handled
          for (const { originalIndex } of currencyDetails) {
            success[originalIndex] = true;
          }
        }
      }
    }

    // Handle Sudoswap listings
    if (sudoswapDetails.length) {
      const orders = sudoswapDetails.map((d) => d.order as Sdk.Sudoswap.Order);
      const fees = getFees(sudoswapDetails);

      const totalPrice = orders
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
      const totalFees = fees
        .map(({ amount }) => bn(amount))
        .reduce((a, b) => a.add(b), bn(0));

      executions.push({
        module: this.contracts.sudoswapModule.address,
        data: this.contracts.sudoswapModule.interface.encodeFunctionData(
          "buyWithETH",
          [
            sudoswapDetails.map(
              (d) => (d.order as Sdk.Sudoswap.Order).params.pair
            ),
            sudoswapDetails.map((d) => d.tokenId),
            Math.floor(Date.now() / 1000) + 10 * 60,
            {
              fillTo: taker,
              refundTo: taker,
              revertIfIncomplete: Boolean(!options?.partial),
              amount: totalPrice,
            },
            fees,
          ]
        ),
        value: totalPrice.add(totalFees),
      });

      // Mark the listings as successfully handled
      for (const { originalIndex } of sudoswapDetails) {
        success[originalIndex] = true;
      }
    }

    // Handle NFTX listings
    if (nftxDetails.length) {
      const orders = nftxDetails.map((d) => d.order as Sdk.Nftx.Order);
      const fees = getFees(nftxDetails);

      const totalPrice = orders
        .map((order) =>
          bn(
            order.params.extra.prices[
              // Handle multiple listings from the same pool
              orders
                .filter((o) => o.params.pool === order.params.pool)
                .findIndex(
                  (o) =>
                    o.params.specificIds?.[0] === order.params.specificIds?.[0]
                )
            ]
          )
        )
        .reduce((a, b) => a.add(b), bn(0));
      const totalFees = fees
        .map(({ amount }) => bn(amount))
        .reduce((a, b) => a.add(b), bn(0));

      // Aggregate same-pool orders
      const perPoolOrders: { [pool: string]: Sdk.Nftx.Order[] } = {};
      for (const details of nftxDetails) {
        const order = details.order as Sdk.Nftx.Order;
        if (!perPoolOrders[order.params.pool]) {
          perPoolOrders[order.params.pool] = [];
        }
        perPoolOrders[order.params.pool].push(order);

        // Update the order's price in-place
        order.params.price =
          order.params.extra.prices[
            perPoolOrders[order.params.pool].length - 1
          ];
      }

      executions.push({
        module: this.contracts.nftxModule.address,
        data: this.contracts.nftxModule.interface.encodeFunctionData(
          "buyWithETH",
          [
            Object.keys(perPoolOrders).map((pool) => ({
              vaultId: perPoolOrders[pool][0].params.vaultId,
              collection: perPoolOrders[pool][0].params.collection,
              specificIds: perPoolOrders[pool].map(
                (o) => o.params.specificIds![0]
              ),
              amount: perPoolOrders[pool].length,
              path: perPoolOrders[pool][0].params.path,
              price: perPoolOrders[pool]
                .map((o) => bn(o.params.price))
                .reduce((a, b) => a.add(b))
                .toString(),
            })),
            {
              fillTo: taker,
              refundTo: taker,
              revertIfIncomplete: Boolean(!options?.partial),
              amount: totalPrice,
            },
            fees,
          ]
        ),
        value: totalPrice.add(totalFees),
      });

      // Mark the listings as successfully handled
      for (const { originalIndex } of nftxDetails) {
        success[originalIndex] = true;
      }
    }

    // Handle X2Y2 listings
    if (x2y2Details.length) {
      const orders = x2y2Details.map((d) => d.order as Sdk.X2Y2.Order);
      const module = this.contracts.x2y2Module.address;

      const fees = getFees(x2y2Details);

      // TODO: Only consider successfully-handled orders
      const totalPrice = orders
        .map((order) => bn(order.params.price))
        .reduce((a, b) => a.add(b), bn(0));
      const totalFees = fees
        .map(({ amount }) => bn(amount))
        .reduce((a, b) => a.add(b), bn(0));

      const exchange = new Sdk.X2Y2.Exchange(
        this.chainId,
        String(this.options?.x2y2ApiKey)
      );

      if (orders.length === 1) {
        try {
          executions.push({
            module,
            data: this.contracts.x2y2Module.interface.encodeFunctionData(
              "acceptETHListing",
              [
                // Fetch X2Y2-signed input
                exchange.contract.interface.decodeFunctionData(
                  "run",
                  await exchange.fetchInput(
                    // For X2Y2, the module acts as the taker proxy
                    module,
                    orders[0],
                    {
                      source: options?.source,
                      tokenId: x2y2Details[0].tokenId,
                    }
                  )
                ).input,
                {
                  fillTo: taker,
                  refundTo: taker,
                  revertIfIncomplete: Boolean(!options?.partial),
                  amount: totalPrice,
                },
                fees,
              ]
            ),
            value: totalPrice.add(totalFees),
          });

          // Mark the listing as successfully handled
          success[x2y2Details[0].originalIndex] = true;
        } catch {
          if (!options?.partial) {
            throw new Error("Could not generate fill data");
          }
        }
      } else {
        const inputs: (string | undefined)[] = await Promise.all(
          orders.map(async (order, i) =>
            // Fetch X2Y2-signed input
            exchange
              .fetchInput(
                // For X2Y2, the module acts as the taker proxy
                module,
                order,
                {
                  source: options?.source,
                  tokenId: x2y2Details[i].tokenId,
                }
              )
              .then(
                (input) =>
                  // Decode the input from the X2Y2 API response
                  exchange.contract.interface.decodeFunctionData("run", input)
                    .input
              )
              .catch(() => undefined)
          )
        );

        if (inputs.some(Boolean)) {
          executions.push({
            module,
            data: this.contracts.x2y2Module.interface.encodeFunctionData(
              "acceptETHListings",
              [
                inputs.filter(Boolean),
                {
                  fillTo: taker,
                  refundTo: taker,
                  revertIfIncomplete: Boolean(!options?.partial),
                  amount: totalPrice,
                },
                fees,
              ]
            ),
            value: totalPrice.add(totalFees),
          });

          for (let i = 0; i < x2y2Details.length; i++) {
            if (inputs[i]) {
              // Mark the listing as successfully handled
              success[x2y2Details[i].originalIndex] = true;
            }
          }
        }
      }
    }

    // Handle ZeroExV4 ERC721 listings
    if (zeroexV4Erc721Details.length) {
      let orders = zeroexV4Erc721Details.map(
        (d) => d.order as Sdk.ZeroExV4.Order
      );

      const unsuccessfulCbIds: string[] = [];
      for (const order of orders) {
        const cbId = order.params.cbOrderId;
        if (cbId) {
          // Release the order's signature
          await new Sdk.ZeroExV4.Exchange(
            this.chainId,
            String(this.options?.cbApiKey!)
          )
            .releaseOrder(taker, order)
            .catch(() => {
              if (!options?.partial) {
                throw new Error("Could not generate fill data");
              } else {
                unsuccessfulCbIds.push(cbId);
              }
            });
        }
      }
      // Remove any orders that were unsuccessfully released
      if (unsuccessfulCbIds.length) {
        orders = orders.filter(
          (order) => !unsuccessfulCbIds.includes(order.params.cbOrderId!)
        );
      }

      if (orders.length) {
        const fees = getFees(zeroexV4Erc721Details);

        const totalPrice = orders
          .map((order) =>
            bn(order.params.erc20TokenAmount).add(
              // For ZeroExV4, the fees are not included in the price
              // TODO: Add order method to get the price including the fees
              order.getFeeAmount()
            )
          )
          .reduce((a, b) => a.add(b), bn(0));
        const totalFees = fees
          .map(({ amount }) => bn(amount))
          .reduce((a, b) => a.add(b), bn(0));

        executions.push({
          module: this.contracts.zeroExV4Module.address,
          data:
            orders.length === 1
              ? this.contracts.zeroExV4Module.interface.encodeFunctionData(
                  "acceptETHListingERC721",
                  [
                    orders[0].getRaw(),
                    orders[0].params,
                    {
                      fillTo: taker,
                      refundTo: taker,
                      revertIfIncomplete: Boolean(!options?.partial),
                      amount: totalPrice,
                    },
                    fees,
                  ]
                )
              : this.contracts.zeroExV4Module.interface.encodeFunctionData(
                  "acceptETHListingsERC721",
                  [
                    orders.map((order) => order.getRaw()),
                    orders.map((order) => order.params),
                    {
                      fillTo: taker,
                      refundTo: taker,
                      revertIfIncomplete: Boolean(!options?.partial),
                      amount: totalPrice,
                    },
                    fees,
                  ]
                ),
          value: totalPrice.add(totalFees),
        });

        // Mark the listings as successfully handled
        for (const { originalIndex } of zeroexV4Erc721Details) {
          success[originalIndex] = true;
        }
      }
    }

    // Handle ZeroExV4 ERC1155 listings
    if (zeroexV4Erc1155Details.length) {
      let orders = zeroexV4Erc1155Details.map(
        (d) => d.order as Sdk.ZeroExV4.Order
      );

      const unsuccessfulCbIds: string[] = [];
      for (const order of orders) {
        const cbId = order.params.cbOrderId;
        if (cbId) {
          // Release the order's signature
          await new Sdk.ZeroExV4.Exchange(
            this.chainId,
            String(this.options?.cbApiKey!)
          )
            .releaseOrder(taker, order)
            .catch(() => {
              if (!options?.partial) {
                throw new Error("Could not generate fill data");
              } else {
                unsuccessfulCbIds.push(cbId);
              }
            });
        }
      }
      // Remove any orders that were unsuccessfully released
      if (unsuccessfulCbIds.length) {
        orders = orders.filter(
          (order) => !unsuccessfulCbIds.includes(order.params.cbOrderId!)
        );
      }

      if (orders.length) {
        const fees = getFees(zeroexV4Erc1155Details);

        const totalPrice = orders
          .map((order, i) =>
            bn(order.params.erc20TokenAmount)
              // For ZeroExV4, the fees are not included in the price
              // TODO: Add order method to get the price including the fees
              .add(order.getFeeAmount())
              .mul(zeroexV4Erc1155Details[i].amount ?? 1)
              // Round up
              // TODO: ZeroExV4 ERC1155 orders are partially-fillable
              .add(bn(order.params.nftAmount ?? 1).sub(1))
              .div(order.params.nftAmount ?? 1)
          )
          .reduce((a, b) => a.add(b), bn(0));
        const totalFees = fees
          .map(({ amount }) => bn(amount))
          .reduce((a, b) => a.add(b), bn(0));

        executions.push({
          module: this.contracts.zeroExV4Module.address,
          data:
            orders.length === 1
              ? this.contracts.zeroExV4Module.interface.encodeFunctionData(
                  "acceptETHListingERC1155",
                  [
                    orders[0].getRaw(),
                    orders[0].params,
                    zeroexV4Erc1155Details[0].amount ?? 1,
                    {
                      fillTo: taker,
                      refundTo: taker,
                      revertIfIncomplete: Boolean(!options?.partial),
                      amount: totalPrice,
                    },
                    fees,
                  ]
                )
              : this.contracts.zeroExV4Module.interface.encodeFunctionData(
                  "acceptETHListingsERC1155",
                  [
                    orders.map((order) => order.getRaw()),
                    orders.map((order) => order.params),
                    zeroexV4Erc1155Details.map((d) => d.amount ?? 1),
                    {
                      fillTo: taker,
                      refundTo: taker,
                      revertIfIncomplete: Boolean(!options?.partial),
                      amount: totalPrice,
                    },
                    fees,
                  ]
                ),
          value: totalPrice.add(totalFees),
        });

        // Mark the listings as successfully handled
        for (const { originalIndex } of zeroexV4Erc1155Details) {
          success[originalIndex] = true;
        }
      }
    }

    // Handle Zora listings
    if (zoraDetails.length) {
      const orders = zoraDetails.map((d) => d.order as Sdk.Zora.Order);
      const fees = getFees(zoraDetails);

      const totalPrice = orders
        .map((order) => bn(order.params.askPrice))
        .reduce((a, b) => a.add(b), bn(0));
      const totalFees = fees
        .map(({ amount }) => bn(amount))
        .reduce((a, b) => a.add(b), bn(0));

      executions.push({
        module: this.contracts.zoraModule.address,
        data:
          orders.length === 1
            ? this.contracts.zoraModule.interface.encodeFunctionData(
                "acceptETHListing",
                [
                  {
                    collection: orders[0].params.tokenContract,
                    tokenId: orders[0].params.tokenId,
                    currency: orders[0].params.askCurrency,
                    amount: orders[0].params.askPrice,
                    finder: taker,
                  },
                  {
                    fillTo: taker,
                    refundTo: taker,
                    revertIfIncomplete: Boolean(!options?.partial),
                    amount: totalPrice,
                  },
                  fees,
                ]
              )
            : this.contracts.zoraModule.interface.encodeFunctionData(
                "acceptETHListings",
                [
                  orders.map((order) => ({
                    collection: order.params.tokenContract,
                    tokenId: order.params.tokenId,
                    currency: order.params.askCurrency,
                    amount: order.params.askPrice,
                    finder: taker,
                  })),
                  {
                    fillTo: taker,
                    refundTo: taker,
                    revertIfIncomplete: Boolean(!options?.partial),
                    amount: totalPrice,
                  },
                  fees,
                ]
              ),
        value: totalPrice.add(totalFees),
      });

      // Mark the listings as successfully handled
      for (const { originalIndex } of zoraDetails) {
        success[originalIndex] = true;
      }
    }

    // Handle Rarible listings
    if (raribleDetails.length) {
      const orders = raribleDetails.map((d) => d.order as Sdk.Rarible.Order);
      const module = this.contracts.raribleModule.address;

      const fees = getFees(raribleDetails);

      const totalPrice = orders
        .map((order) => bn(order.params.take.value))
        .reduce((a, b) => a.add(b), bn(0));
      const totalFees = fees
        .map(({ amount }) => bn(amount))
        .reduce((a, b) => a.add(b), bn(0));

      executions.push({
        module,
        data:
          orders.length === 1
            ? this.contracts.raribleModule.interface.encodeFunctionData(
                "acceptETHListing",
                [
                  encodeForMatchOrders(orders[0].params),
                  orders[0].params.signature,
                  encodeForMatchOrders(orders[0].buildMatching(module)),
                  "0x",
                  {
                    fillTo: taker,
                    refundTo: taker,
                    revertIfIncomplete: Boolean(!options?.partial),
                    amount: totalPrice,
                  },
                  fees,
                ]
              )
            : this.contracts.raribleModule.interface.encodeFunctionData(
                "acceptETHListings",
                [
                  orders.map((order) => encodeForMatchOrders(order.params)),
                  orders.map((order) => order.params.signature),
                  orders.map((order) =>
                    encodeForMatchOrders(order.buildMatching(module))
                  ),
                  "0x",
                  {
                    fillTo: taker,
                    refundTo: taker,
                    revertIfIncomplete: Boolean(!options?.partial),
                    amount: totalPrice,
                  },
                  fees,
                ]
              ),
        value: totalPrice.add(totalFees),
      });

      // Mark the listings as successfully handled
      for (const { originalIndex } of raribleDetails) {
        success[originalIndex] = true;
      }
    }

    if (!executions.length) {
      throw new Error("No executions to handle");
    }

    return {
      approvals,
      permits: await (async (): Promise<FTPermit[]> => {
        return permitItems.length
          ? [
              {
                currencies: permitItems.map((i) => i.token),
                details: {
                  kind: "permit2",
                  data: await new UniswapPermit.Handler(
                    this.chainId,
                    this.provider
                  ).generate(permitItems),
                },
              },
            ]
          : [];
      })(),
      txData: {
        from: relayer,
        to: this.contracts.router.address,
        data:
          this.contracts.router.interface.encodeFunctionData("execute", [
            executions,
          ]) + generateSourceBytes(options?.source),
        value: executions
          .map((e) => bn(e.value))
          .reduce((a, b) => a.add(b))
          .toHexString(),
      },
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
      // Force using permit
      forcePermit?: boolean;
    }
  ): Promise<{
    txData: TxData;
    approvals: NFTApproval[];
    permits: NFTPermit[];
    success: boolean[];
  }> {
    // Assume the bid details are consistent with the underlying order object

    // CASE 1
    // Handle exchanges which don't have a router module implemented by filling directly

    // TODO: Add Blur router module
    if (details.some(({ kind }) => kind === "blur")) {
      if (details.length > 1) {
        throw new Error("Blur multi-selling is not supported");
      } else {
        const detail = details[0];

        // Approve Blur's ExecutionDelegate contract
        const approval = {
          contract: detail.contract,
          owner: taker,
          operator: Sdk.Blur.Addresses.ExecutionDelegate[this.chainId],
          txData: generateNFTApprovalTxData(
            detail.contract,
            taker,
            Sdk.Blur.Addresses.ExecutionDelegate[this.chainId]
          ),
        };

        const order = detail.order as Sdk.Blur.Order;
        const exchange = new Sdk.Blur.Exchange(this.chainId);
        const matchOrder = order.buildMatching({
          trader: taker,
        });
        return {
          txData: exchange.fillOrderTx(taker, order, matchOrder),
          success: [true],
          approvals: [approval],
          permits: [],
        };
      }
    }

    // TODO: Add Universe router module
    if (details.some(({ kind }) => kind === "universe")) {
      if (details.length > 1) {
        throw new Error("Universe multi-selling is not supported");
      } else {
        const detail = details[0];

        // Approve Universe's Exchange contract
        const approval = {
          contract: detail.contract,
          owner: taker,
          operator: Sdk.Universe.Addresses.Exchange[this.chainId],
          txData: generateNFTApprovalTxData(
            detail.contract,
            taker,
            Sdk.Universe.Addresses.Exchange[this.chainId]
          ),
        };

        const order = detail.order as Sdk.Universe.Order;
        const exchange = new Sdk.Universe.Exchange(this.chainId);
        return {
          txData: await exchange.fillOrderTx(taker, order, {
            amount: Number(detail.amount ?? 1),
            source: options?.source,
          }),
          success: [true],
          approvals: [approval],
          permits: [],
        };
      }
    }

    // TODO: Add Forward router module
    if (details.some(({ kind }) => kind === "forward")) {
      if (details.length > 1) {
        throw new Error("Forward multi-selling is not supported");
      } else {
        const detail = details[0];

        // Approve Forward's Exchange contract
        const approval = {
          contract: detail.contract,
          owner: taker,
          operator: Sdk.Forward.Addresses.Exchange[this.chainId],
          txData: generateNFTApprovalTxData(
            detail.contract,
            taker,
            Sdk.Forward.Addresses.Exchange[this.chainId]
          ),
        };

        const order = detail.order as Sdk.Forward.Order;
        const matchParams = order.buildMatching({
          tokenId: detail.tokenId,
          amount: detail.amount ?? 1,
          ...(detail.extraArgs ?? {}),
        });

        const exchange = new Sdk.Forward.Exchange(this.chainId);
        return {
          txData: exchange.fillOrderTx(taker, order, matchParams, {
            source: options?.source,
          }),
          success: [true],
          approvals: [approval],
          permits: [],
        };
      }
    }

    // CASE 2
    // Handle exchanges which do have a router module implemented by filling through the router

    // Step 1
    // Handle approvals and permits

    // Keep track of any approvals that might be needed
    const approvals: NFTApproval[] = [];

    // Keep track of the tokens needed by each module
    const permitItems: SeaportPermit.Item[] = [];

    for (let i = 0; i < details.length; i++) {
      const detail = details[i];

      const contract = detail.contract;
      const owner = taker;
      const operator = Sdk.Seaport.Addresses.OpenseaConduit[this.chainId];

      // Generate approval
      approvals.push({
        contract,
        owner,
        operator,
        txData: generateNFTApprovalTxData(contract, owner, operator),
      });

      // Generate permit item
      let module: Contract;
      switch (detail.kind) {
        case "looks-rare": {
          module = this.contracts.looksRareModule;
          break;
        }

        case "seaport":
        case "seaport-partial": {
          module = this.contracts.seaportModule;
          break;
        }

        case "seaport-v1.2":
        case "seaport-v1.2-partial": {
          module = this.contracts.seaportV12Module;
          break;
        }

        case "sudoswap": {
          module = this.contracts.sudoswapModule;
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

        default: {
          throw new Error("Unreachable");
        }
      }

      permitItems.push({
        token: {
          kind: detail.contractKind,
          contract: detail.contract,
          tokenId: detail.tokenId,
          amount: detail.amount,
        },
        receiver: module.address,
      });
    }

    // Step 2
    // Handle calldata generation

    // Generate router executions
    const executions: ExecutionInfo[] = [];
    const success: boolean[] = details.map(() => false);

    for (let i = 0; i < details.length; i++) {
      const detail = details[i];

      switch (detail.kind) {
        case "looks-rare": {
          const order = detail.order as Sdk.LooksRare.Order;
          const module = this.contracts.looksRareModule;

          const matchParams = order.buildMatching(
            // For LooksRare, the module acts as the taker proxy
            module.address,
            {
              tokenId: detail.tokenId,
              ...(detail.extraArgs || {}),
            }
          );

          executions.push({
            module: module.address,
            data: module.interface.encodeFunctionData(
              detail.contractKind === "erc721"
                ? "acceptERC721Offer"
                : "acceptERC1155Offer",
              [
                matchParams,
                order.params,
                {
                  fillTo: taker,
                  refundTo: taker,
                  revertIfIncomplete: Boolean(!options?.partial),
                },
                detail.fees ?? [],
              ]
            ),
            value: 0,
          });

          success[i] = true;

          break;
        }

        case "seaport": {
          const order = detail.order as Sdk.Seaport.Order;
          const module = this.contracts.seaportModule;

          const matchParams = order.buildMatching({
            tokenId: detail.tokenId,
            amount: detail.amount ?? 1,
            ...(detail.extraArgs ?? {}),
          });

          const exchange = new Sdk.Seaport.Exchange(this.chainId);
          executions.push({
            module: module.address,
            data: module.interface.encodeFunctionData(
              detail.contractKind === "erc721"
                ? "acceptERC721Offer"
                : "acceptERC1155Offer",
              [
                {
                  parameters: {
                    ...order.params,
                    totalOriginalConsiderationItems:
                      order.params.consideration.length,
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
                detail.fees ?? [],
              ]
            ),
            value: 0,
          });

          success[i] = true;

          break;
        }

        case "seaport-partial": {
          const order = detail.order as Sdk.Seaport.Types.PartialOrder;
          const module = this.contracts.seaportModule;

          try {
            const result = await axios.get(
              `https://order-fetcher.vercel.app/api/offer?orderHash=${
                order.id
              }&contract=${order.contract}&tokenId=${order.tokenId}&taker=${
                detail.owner ?? taker
              }&chainId=${this.chainId}` +
                (order.unitPrice ? `&unitPrice=${order.unitPrice}` : "")
            );

            const fullOrder = new Sdk.Seaport.Order(
              this.chainId,
              result.data.order
            );

            const exchange = new Sdk.Seaport.Exchange(this.chainId);
            executions.push({
              module: module.address,
              data: module.interface.encodeFunctionData(
                detail.contractKind === "erc721"
                  ? "acceptERC721Offer"
                  : "acceptERC1155Offer",
                [
                  {
                    parameters: {
                      ...fullOrder.params,
                      totalOriginalConsiderationItems:
                        fullOrder.params.consideration.length,
                    },
                    numerator: detail.amount ?? 1,
                    denominator: fullOrder.getInfo()!.amount,
                    signature: fullOrder.params.signature,
                    extraData: await exchange.getExtraData(fullOrder),
                  },
                  result.data.criteriaResolvers ?? [],
                  {
                    fillTo: taker,
                    refundTo: taker,
                    revertIfIncomplete: Boolean(!options?.partial),
                  },
                  detail.fees ?? [],
                ]
              ),
              value: 0,
            });

            success[i] = true;
          } catch {
            if (!options?.partial) {
              throw new Error("Could not generate fill data");
            } else {
              continue;
            }
          }

          break;
        }

        case "seaport-v1.2": {
          const order = detail.order as Sdk.SeaportV12.Order;
          const module = this.contracts.seaportV12Module;

          const matchParams = order.buildMatching({
            tokenId: detail.tokenId,
            amount: detail.amount ?? 1,
            ...(detail.extraArgs ?? {}),
          });

          const exchange = new Sdk.SeaportV12.Exchange(this.chainId);
          executions.push({
            module: module.address,
            data: module.interface.encodeFunctionData(
              detail.contractKind === "erc721"
                ? "acceptERC721Offer"
                : "acceptERC1155Offer",
              [
                {
                  parameters: {
                    ...order.params,
                    totalOriginalConsiderationItems:
                      order.params.consideration.length,
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
                detail.fees ?? [],
              ]
            ),
            value: 0,
          });

          success[i] = true;

          break;
        }

        case "seaport-v1.2-partial": {
          const order = detail.order as Sdk.SeaportV12.Types.PartialOrder;
          const module = this.contracts.seaportV12Module;

          try {
            const result = await axios.get(
              `https://order-fetcher.vercel.app/api/offer?orderHash=${
                order.id
              }&contract=${order.contract}&tokenId=${order.tokenId}&taker=${
                detail.owner ?? taker
              }&chainId=${this.chainId}` +
                (order.unitPrice ? `&unitPrice=${order.unitPrice}` : "")
            );

            const fullOrder = new Sdk.SeaportV12.Order(
              this.chainId,
              result.data.order
            );

            const exchange = new Sdk.SeaportV12.Exchange(this.chainId);
            executions.push({
              module: module.address,
              data: module.interface.encodeFunctionData(
                detail.contractKind === "erc721"
                  ? "acceptERC721Offer"
                  : "acceptERC1155Offer",
                [
                  {
                    parameters: {
                      ...fullOrder.params,
                      totalOriginalConsiderationItems:
                        fullOrder.params.consideration.length,
                    },
                    numerator: detail.amount ?? 1,
                    denominator: fullOrder.getInfo()!.amount,
                    signature: fullOrder.params.signature,
                    extraData: await exchange.getExtraData(fullOrder),
                  },
                  result.data.criteriaResolvers ?? [],
                  {
                    fillTo: taker,
                    refundTo: taker,
                    revertIfIncomplete: Boolean(!options?.partial),
                  },
                  detail.fees ?? [],
                ]
              ),
              value: 0,
            });

            success[i] = true;
          } catch {
            if (!options?.partial) {
              throw new Error("Could not generate fill data");
            } else {
              continue;
            }
          }

          break;
        }

        case "sudoswap": {
          const order = detail.order as Sdk.Sudoswap.Order;
          const module = this.contracts.sudoswapModule;

          executions.push({
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
              detail.fees ?? [],
            ]),
            value: 0,
          });

          success[i] = true;

          break;
        }

        case "x2y2": {
          const order = detail.order as Sdk.X2Y2.Order;
          const module = this.contracts.x2y2Module;

          try {
            const exchange = new Sdk.X2Y2.Exchange(
              this.chainId,
              String(this.options?.x2y2ApiKey)
            );
            executions.push({
              module: module.address,
              data: module.interface.encodeFunctionData(
                detail.contractKind === "erc721"
                  ? "acceptERC721Offer"
                  : "acceptERC1155Offer",
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
                  detail.fees ?? [],
                ]
              ),
              value: 0,
            });

            success[i] = true;
          } catch {
            if (!options?.partial) {
              throw new Error("Could not generate fill data");
            } else {
              continue;
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
                String(this.options?.cbApiKey!)
              ).releaseOrder(taker, order);
            }

            if (detail.contractKind === "erc721") {
              executions.push({
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
                  detail.fees ?? [],
                ]),
                value: 0,
              });
            } else {
              executions.push({
                module: module.address,
                data: module.interface.encodeFunctionData(
                  "acceptERC1155Offer",
                  [
                    order.getRaw(),
                    order.params,
                    detail.amount ?? 1,
                    {
                      fillTo: taker,
                      refundTo: taker,
                      revertIfIncomplete: Boolean(!options?.partial),
                    },
                    detail.tokenId,
                    detail.fees ?? [],
                  ]
                ),
                value: 0,
              });
            }

            success[i] = true;
          } catch {
            if (!options?.partial) {
              throw new Error("Could not generate fill data");
            } else {
              continue;
            }
          }

          break;
        }

        case "element": {
          const order = detail.order as Sdk.Element.Order;
          const module = this.contracts.elementModule;

          if (detail.contractKind === "erc721") {
            executions.push({
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
                detail.fees ?? [],
              ]),
              value: 0,
            });
          } else {
            executions.push({
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
                detail.fees ?? [],
              ]),
              value: 0,
            });
          }

          success[i] = true;

          break;
        }

        case "nftx": {
          const order = detail.order as Sdk.Nftx.Order;
          const module = this.contracts.nftxModule;

          const tokenId = detail.tokenId;
          order.params.specificIds = [tokenId];

          executions.push({
            module: module.address,
            data: module.interface.encodeFunctionData("sell", [
              [order.params],
              {
                fillTo: taker,
                refundTo: taker,
                revertIfIncomplete: Boolean(!options?.partial),
              },
              detail.fees ?? [],
            ]),
            value: 0,
          });

          success[i] = true;

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

          executions.push({
            module: module.address,
            data: module.interface.encodeFunctionData(
              detail.contractKind === "erc721"
                ? "acceptERC721Offer"
                : "acceptERC1155Offer",
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
                detail.fees ?? [],
              ]
            ),
            value: 0,
          });

          success[i] = true;

          break;
        }

        default: {
          throw new Error("Unreachable");
        }
      }
    }

    if (!executions.length) {
      throw new Error("No executions to handle");
    }

    // Generate router-level transaction data
    const routerLevelTxData =
      this.contracts.router.interface.encodeFunctionData("execute", [
        executions,
      ]);

    if (executions.length === 1 && !options?.forcePermit) {
      // Use the on-received ERC721/ERC1155 hooks for approval-less bid filling
      const detail = details[success.findIndex(Boolean)];
      if (detail.contractKind === "erc721") {
        return {
          txData: {
            from: taker,
            to: detail.contract,
            data:
              new Interface(ERC721Abi).encodeFunctionData(
                "safeTransferFrom(address,address,uint256,bytes)",
                [taker, executions[0].module, detail.tokenId, routerLevelTxData]
              ) + generateSourceBytes(options?.source),
          },
          success,
          approvals: [],
          permits: [],
        };
      } else {
        return {
          txData: {
            from: taker,
            to: detail.contract,
            data:
              new Interface(ERC1155Abi).encodeFunctionData(
                "safeTransferFrom(address,address,uint256,uint256,bytes)",
                [
                  taker,
                  executions[0].module,
                  detail.tokenId,
                  detail.amount ?? 1,
                  routerLevelTxData,
                ]
              ) + generateSourceBytes(options?.source),
          },
          success,
          approvals: [],
          permits: [],
        };
      }
    } else {
      return {
        txData: {
          from: taker,
          to: Addresses.Router[this.chainId],
          data: routerLevelTxData + generateSourceBytes(options?.source),
        },
        success,
        // Ensure approvals are unique
        approvals: uniqBy(
          approvals.filter((_, i) => success[i]),
          ({ txData: { from, to, data } }) => `${from}-${to}-${data}`
        ),
        // Generate permits
        permits: await (async (): Promise<NFTPermit[]> => {
          const items = permitItems.filter((_, i) => success[i]);
          return [
            {
              tokens: items.map((i) => i.token),
              details: {
                kind: "seaport",
                data: await new SeaportPermit.Handler(
                  this.chainId,
                  this.provider
                ).generate(taker, items),
              },
            },
          ];
        })(),
      };
    }
  }
}
