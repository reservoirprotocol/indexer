import { Provider } from "@ethersproject/abstract-provider";
import { TypedDataSigner } from "@ethersproject/abstract-signer";
import { BigNumberish } from "@ethersproject/bignumber";
import { splitSignature } from "@ethersproject/bytes";
import { AddressZero, HashZero } from "@ethersproject/constants";
import { Contract } from "@ethersproject/contracts";
import { _TypedDataEncoder } from "@ethersproject/hash";
import { verifyTypedData } from "@ethersproject/wallet";

import * as Addresses from "./addresses";
import { Builders } from "./builders";
import { BaseBuilder, MatchingOptions } from "./builders/base";
import * as Types from "./types";
import * as Common from "../common";
import { lc, s, n, bn } from "../utils";

import ExchangeAbi from "./abis/PaymentProcessor.json";

export class Order {
  public chainId: number;
  public params: Types.BaseOrder;

  constructor(chainId: number, params: Types.BaseOrder) {
    this.chainId = chainId;
    try {
      this.params = normalize(params);
    } catch {
      throw new Error("Invalid params");
    }

    // Detect kind
    if (!params.kind) {
      this.params.kind = this.detectKind();
    }
  }

  public hash() {
    const [types, value, structName] = this.getEip712TypesAndValue();
    return _TypedDataEncoder.hashStruct(structName, types, value);
  }

  public isBuyOrder() {
    return ["offer-approval", "collection-offer-approval"].includes(this.params.kind!);
  }

  public checkValidity() {
    if (!this.getBuilder().isValid(this)) {
      throw new Error("Invalid order");
    }
  }

  private detectKind(): Types.OrderKind {
    if (!this.params.sellerAcceptedOffer && !this.params.collectionLevelOffer) {
      return "sale-approval";
    }

    if (this.params.sellerAcceptedOffer && !this.params.collectionLevelOffer) {
      return "offer-approval";
    }

    if (this.params.sellerAcceptedOffer && this.params.collectionLevelOffer) {
      return "collection-offer-approval";
    }

    throw new Error("Could not detect order kind (order might have unsupported params/calldata)");
  }

  public async sign(signer: TypedDataSigner) {
    const [types, value] = this.getEip712TypesAndValue();
    const signature = await signer._signTypedData(EIP712_DOMAIN(this.chainId), types, value);
    const { r, s, v } = splitSignature(signature);
    this.params = {
      ...this.params,
      r,
      s,
      v,
    };
  }

  public getSignatureData() {
    const [types, value] = this.getEip712TypesAndValue();
    return {
      signatureKind: "eip712",
      domain: EIP712_DOMAIN(this.chainId),
      types,
      value,
      primaryType: _TypedDataEncoder.getPrimaryType(types),
    };
  }

  public getMatchedOrder(matchOrder: Order): Types.MatchedOrder {
    const isBuyOrder = this.isBuyOrder();
    const sellOrder = isBuyOrder ? matchOrder.params : this.params;
    const buyOrder = isBuyOrder ? this.params : matchOrder.params;

    return {
      sellerAcceptedOffer: sellOrder.sellerAcceptedOffer ?? false,
      collectionLevelOffer: buyOrder.collectionLevelOffer ?? false,
      protocol: sellOrder.protocol,
      paymentCoin: sellOrder.coin,
      tokenAddress: sellOrder.tokenAddress,
      seller: sellOrder.sellerOrBuyer,
      privateBuyer: sellOrder.privateBuyerOrDelegatedPurchaser,
      buyer: buyOrder.sellerOrBuyer,
      delegatedPurchaser: buyOrder.privateBuyerOrDelegatedPurchaser,
      marketplace: sellOrder.marketplace,
      marketplaceFeeNumerator: sellOrder.marketplaceFeeNumerator,
      maxRoyaltyFeeNumerator: sellOrder.maxRoyaltyFeeNumerator ?? "0",
      listingNonce: sellOrder.nonce,
      listingMinPrice: sellOrder.price,
      listingExpiration: sellOrder.expiration,
      offerNonce: buyOrder.nonce,
      offerPrice: buyOrder.price,
      offerExpiration: buyOrder.expiration,
      tokenId: sellOrder.tokenId ?? "0",
      amount: sellOrder.amount,
      listingSignature: {
        r: sellOrder.r!,
        s: sellOrder.s!,
        v: sellOrder.v!,
      },
      offerSignature: {
        r: buyOrder.r!,
        s: buyOrder.s!,
        v: buyOrder.v!,
      },
    };
  }

  public getSweepMatchedOrder(orders: Order[]): Types.SweepMatchedOrder {
    const matchedOrderBundleBase: Types.MatchedOrderBundleBase = {
      protocol: this.params.protocol,
      paymentCoin: this.params.coin,
      tokenAddress: this.params.tokenAddress,
      privateBuyer: AddressZero,
      buyer: this.params.sellerOrBuyer,
      delegatedPurchaser: AddressZero,
      marketplace: this.params.marketplace,
      marketplaceFeeNumerator: this.params.marketplaceFeeNumerator,
      offerNonce: this.params.nonce,
      offerPrice: this.params.price,
      offerExpiration: this.params.expiration,
    };

    return {
      bundleDetails: matchedOrderBundleBase,
      signedOffer: {
        r: this.params.r!,
        s: this.params.s!,
        v: this.params.v!,
      },
      signedListings: orders.map((c) => ({
        r: c.params.r!,
        s: c.params.s!,
        v: c.params.v!,
      })),
      bundleItems: orders.map((c) => ({
        tokenId: c.params.tokenId!,
        amount: c.params.amount,
        maxRoyaltyFeeNumerator: c.params.maxRoyaltyFeeNumerator,
        itemPrice: c.params.price,
        listingNonce: c.params.nonce,
        listingExpiration: c.params.expiration,
        seller: c.params.sellerOrBuyer,
      })),
    };
  }

  public checkSignature() {
    const signature = {
      r: this.params.r!,
      s: this.params.s!,
      v: this.params.v!,
    };

    const [types, value] = this.getEip712TypesAndValue();
    const recoveredSigner = verifyTypedData(EIP712_DOMAIN(this.chainId), types, value, signature);

    if (lc(this.params.sellerOrBuyer) !== lc(recoveredSigner)) {
      throw new Error("Invalid listing signature");
    }
  }

  public async checkFillability(provider: Provider) {
    const chainId = await provider.getNetwork().then((n) => n.chainId);
    const exchange = new Contract(Addresses.Exchange[this.chainId], ExchangeAbi, provider);

    const traderMasterNonce = await exchange.masterNonces(this.params.sellerOrBuyer);
    if (traderMasterNonce.gt(this.params.nonce)) {
      throw new Error("cancelled");
    }

    if (!this.isBuyOrder()) {
      if (this.params.protocol === Types.TokenProtocols.ERC721) {
        const erc721 = new Common.Helpers.Erc721(provider, this.params.tokenAddress);
        // Check ownership
        const owner = await erc721.getOwner(this.params.tokenId!);
        if (lc(owner) !== lc(this.params.sellerOrBuyer)) {
          throw new Error("no-balance");
        }

        // Check approval
        const isApproved = await erc721.isApproved(
          this.params.sellerOrBuyer,
          Addresses.Exchange[this.chainId]
        );
        if (!isApproved) {
          throw new Error("no-approval");
        }
      } else if (this.params.protocol === Types.TokenProtocols.ERC1155) {
        const erc1155 = new Common.Helpers.Erc1155(provider, this.params.tokenAddress);
        // Check balance
        const balance = await erc1155.getBalance(this.params.sellerOrBuyer, this.params.tokenId!);
        if (bn(balance).lt(this.params.amount)) {
          throw new Error("no-balance");
        }

        // Check approval
        const isApproved = await erc1155.isApproved(
          this.params.sellerOrBuyer,
          Addresses.Exchange[this.chainId]
        );
        if (!isApproved) {
          throw new Error("no-approval");
        }
      }
    } else {
      const totalPrice = this.params.price;

      // Check that maker has enough balance to cover the payment
      // and the approval to the token transfer proxy is set
      const erc20 = new Common.Helpers.Erc20(provider, this.params.coin);
      const balance = await erc20.getBalance(this.params.sellerOrBuyer);
      if (bn(balance).lt(totalPrice)) {
        throw new Error("no-balance");
      }

      // Check allowance
      const allowance = await erc20.getAllowance(
        this.params.sellerOrBuyer,
        Addresses.Exchange[chainId]
      );
      if (bn(allowance).lt(totalPrice)) {
        throw new Error("no-approval");
      }
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private getEip712TypesAndValue(): any {
    if (this.params.kind === "sale-approval") {
      const listing: Types.SaleApproval = {
        protocol: this.params.protocol,
        sellerAcceptedOffer: this.params.sellerAcceptedOffer!,
        marketplace: this.params.marketplace,
        marketplaceFeeNumerator: this.params.marketplaceFeeNumerator,
        maxRoyaltyFeeNumerator: this.params.maxRoyaltyFeeNumerator,
        privateBuyer: this.params.privateBuyerOrDelegatedPurchaser,
        seller: this.params.sellerOrBuyer,
        tokenAddress: this.params.tokenAddress,
        tokenId: this.params.tokenId!,
        amount: this.params.amount,
        minPrice: this.params.price,
        expiration: this.params.expiration,
        nonce: this.params.nonce,
        masterNonce: this.params.masterNonce,
        coin: this.params.coin,
      };
      return [EIP712_SALE_APPROVAL_TYPES, listing, "SaleApproval"];
    } else if (this.params.kind === "offer-approval") {
      const offer: Types.OfferApproval = {
        protocol: this.params.protocol,
        marketplace: this.params.marketplace,
        marketplaceFeeNumerator: this.params.marketplaceFeeNumerator,
        delegatedPurchaser: this.params.privateBuyerOrDelegatedPurchaser,
        buyer: this.params.sellerOrBuyer,
        tokenAddress: this.params.tokenAddress,
        tokenId: this.params.tokenId!,
        amount: this.params.amount,
        price: this.params.price,
        expiration: this.params.expiration,
        nonce: this.params.nonce,
        masterNonce: this.params.masterNonce,
        coin: this.params.coin,
      };
      return [EIP712_OFFER_APPROVAL_TYPES, offer, "OfferApproval"];
    } else if (this.params.kind === "collection-offer-approval") {
      const collectionOffer: Types.CollectionOfferApproval = {
        protocol: this.params.protocol,
        marketplace: this.params.marketplace,
        collectionLevelOffer: this.params.collectionLevelOffer!,
        marketplaceFeeNumerator: this.params.marketplaceFeeNumerator,
        delegatedPurchaser: this.params.privateBuyerOrDelegatedPurchaser,
        buyer: this.params.sellerOrBuyer,
        tokenAddress: this.params.tokenAddress,
        amount: this.params.amount,
        price: this.params.price,
        expiration: this.params.expiration,
        nonce: this.params.nonce,
        masterNonce: this.params.masterNonce,
        coin: this.params.coin,
      };
      return [EIP712_COLLECTION_OFFER_APPROVAL_TYPES, collectionOffer, "CollectionOfferApproval"];
    } else if (this.params.kind === "bundled-offer-approval") {
      const bundleOffer: Types.BundledOfferApproval = {
        protocol: this.params.protocol,
        marketplace: this.params.marketplace,
        marketplaceFeeNumerator: this.params.marketplaceFeeNumerator,
        delegatedPurchaser: AddressZero,
        buyer: this.params.sellerOrBuyer,
        tokenAddress: this.params.tokenAddress,
        price: this.params.price,
        expiration: this.params.expiration,
        nonce: this.params.nonce,
        masterNonce: this.params.masterNonce,
        coin: this.params.coin,
        tokenIds: this.params.tokenIds!,
        amounts: this.params.amounts!,
        itemSalePrices: this.params.itemSalePrices!,
      };
      return [EIP712_BUNDLED_OFFER_APPROVAL_TYPES, bundleOffer, "BundledOfferApproval"];
    }
  }

  static createBundledOfferOrder(
    orders: Order[],
    options: {
      taker: string;
      takerMasterNonce: BigNumberish;
      maxRoyaltyFeeNumerator?: BigNumberish;
    }
  ) {
    const order = orders[0];
    const orderParams = order.params;
    return new Order(order.chainId, {
      kind: "bundled-offer-approval",
      protocol: orderParams.protocol,
      collectionLevelOffer: false,
      sellerAcceptedOffer: false,
      marketplace: orderParams.marketplace,
      marketplaceFeeNumerator: orderParams.marketplaceFeeNumerator,
      maxRoyaltyFeeNumerator: options?.maxRoyaltyFeeNumerator?.toString() ?? "0",
      privateBuyerOrDelegatedPurchaser: AddressZero,
      sellerOrBuyer: options.taker,
      tokenAddress: orderParams.tokenAddress,
      amount: orderParams.amount,
      price: orders.reduce((all, order) => all.add(order.params.price), bn(0)).toString(),
      expiration: orderParams.expiration,
      nonce: orderParams.nonce,
      coin: orderParams.coin,
      masterNonce: s(options.takerMasterNonce),

      tokenIds: orders.map((c) => c.params.tokenId!),
      amounts: orders.map((c) => c.params.amount),
      itemSalePrices: orders.map((c) => c.params.price),
    });
  }

  private getBuilder(): BaseBuilder {
    switch (this.params.kind) {
      case "collection-offer-approval": {
        return new Builders.ContractWide(this.chainId);
      }

      case "offer-approval":
      case "sale-approval": {
        return new Builders.SingleToken(this.chainId);
      }

      default: {
        throw new Error("Unknown order kind");
      }
    }
  }

  public buildMatching(options: MatchingOptions) {
    return this.getBuilder().buildMatching(this, options);
  }
}

export const EIP712_SALE_APPROVAL_TYPES = {
  SaleApproval: [
    { name: "protocol", type: "uint8" },
    { name: "sellerAcceptedOffer", type: "bool" },
    { name: "marketplace", type: "address" },
    { name: "marketplaceFeeNumerator", type: "uint256" },
    { name: "maxRoyaltyFeeNumerator", type: "uint256" },
    { name: "privateBuyer", type: "address" },
    { name: "seller", type: "address" },
    { name: "tokenAddress", type: "address" },
    { name: "tokenId", type: "uint256" },
    { name: "amount", type: "uint256" },
    { name: "minPrice", type: "uint256" },
    { name: "expiration", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "masterNonce", type: "uint256" },
    { name: "coin", type: "address" },
  ],
};

export const EIP712_OFFER_APPROVAL_TYPES = {
  OfferApproval: [
    { name: "protocol", type: "uint8" },
    { name: "marketplace", type: "address" },
    { name: "marketplaceFeeNumerator", type: "uint256" },
    { name: "delegatedPurchaser", type: "address" },
    { name: "buyer", type: "address" },
    { name: "tokenAddress", type: "address" },
    { name: "tokenId", type: "uint256" },
    { name: "amount", type: "uint256" },
    { name: "price", type: "uint256" },
    { name: "expiration", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "masterNonce", type: "uint256" },
    { name: "coin", type: "address" },
  ],
};

export const EIP712_COLLECTION_OFFER_APPROVAL_TYPES = {
  CollectionOfferApproval: [
    { name: "protocol", type: "uint8" },
    { name: "collectionLevelOffer", type: "bool" },
    { name: "marketplace", type: "address" },
    { name: "marketplaceFeeNumerator", type: "uint256" },
    { name: "delegatedPurchaser", type: "address" },
    { name: "buyer", type: "address" },
    { name: "tokenAddress", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "price", type: "uint256" },
    { name: "expiration", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "masterNonce", type: "uint256" },
    { name: "coin", type: "address" },
  ],
};

export const EIP712_BUNDLED_OFFER_APPROVAL_TYPES = {
  BundledOfferApproval: [
    { name: "protocol", type: "uint8" },
    { name: "marketplace", type: "address" },
    { name: "marketplaceFeeNumerator", type: "uint256" },
    { name: "delegatedPurchaser", type: "address" },
    { name: "buyer", type: "address" },
    { name: "tokenAddress", type: "address" },
    { name: "price", type: "uint256" },
    { name: "expiration", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "masterNonce", type: "uint256" },
    { name: "coin", type: "address" },
    { name: "tokenIds", type: "uint256[]" },
    { name: "amounts", type: "uint256[]" },
    { name: "itemSalePrices", type: "uint256[]" },
  ],
};

export const EIP712_DOMAIN = (chainId: number) => ({
  name: "PaymentProcessor",
  version: "1",
  chainId,
  verifyingContract: Addresses.Exchange[chainId],
});

const normalize = (order: Types.BaseOrder): Types.BaseOrder => {
  // Perform some normalization operations on the order:
  // - convert bignumbers to strings where needed
  // - convert strings to numbers where needed
  // - lowercase all strings
  return {
    kind: order.kind,

    protocol: n(order.protocol),
    marketplace: lc(order.marketplace),
    marketplaceFeeNumerator: s(order.marketplaceFeeNumerator),
    tokenAddress: lc(order.tokenAddress),
    tokenId: order.tokenId !== undefined ? s(order.tokenId) : undefined,
    amount: s(order.amount),
    price: s(order.price),
    expiration: s(order.expiration),
    nonce: s(order.nonce),
    masterNonce: s(order.masterNonce),
    coin: lc(order.coin),

    privateBuyerOrDelegatedPurchaser: lc(order.privateBuyerOrDelegatedPurchaser),
    sellerOrBuyer: lc(order.sellerOrBuyer),

    sellerAcceptedOffer: order.sellerAcceptedOffer,
    maxRoyaltyFeeNumerator:
      order.maxRoyaltyFeeNumerator !== undefined ? s(order.maxRoyaltyFeeNumerator) : undefined,

    collectionLevelOffer: order.collectionLevelOffer ?? undefined,

    tokenIds: order.tokenIds ? order.tokenIds.map((c) => s(c)) : undefined,
    amounts: order.amounts ? order.amounts.map((c) => s(c)) : undefined,
    itemSalePrices: order.itemSalePrices ? order.itemSalePrices.map((c) => s(c)) : undefined,

    v: order.v ?? 0,
    r: order.r ?? HashZero,
    s: order.s ?? HashZero,
  };
};
