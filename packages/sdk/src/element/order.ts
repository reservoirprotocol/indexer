import { defaultAbiCoder } from "@ethersproject/abi";
import { Provider } from "@ethersproject/abstract-provider";
import { TypedDataSigner } from "@ethersproject/abstract-signer";
import { hexZeroPad, splitSignature } from "@ethersproject/bytes";
import { BigNumber, BigNumberish } from "@ethersproject/bignumber";
import { AddressZero, HashZero, MaxUint256 } from "@ethersproject/constants";
import { Contract } from "@ethersproject/contracts";
import { _TypedDataEncoder } from "@ethersproject/hash";
import { keccak256 } from "@ethersproject/keccak256";
import { verifyTypedData } from "@ethersproject/wallet";

import * as Addresses from "./addresses";
import { Builders } from "./builders";
import { BaseBuilder, BaseOrderInfo } from "./builders/base";
import * as Types from "./types";
import * as Common from "../common";
import { bn, lc, s } from "../utils";

import ExchangeAbi from "./abis/Exchange.json";

export class Order {
  public chainId: number;
  public params: Types.BaseOrder | Types.BatchSignedOrder;

  constructor(
    chainId: number,
    params: Types.BaseOrder | Types.BatchSignedOrder
  ) {
    this.chainId = chainId;

    if (this.isBatchSignedOrder(params)) {
      try {
        this.params = normalizeBatchSignedOrder(
          params as Types.BatchSignedOrder
        );
      } catch {
        throw new Error("Invalid params");
      }
    } else {
      const p = params as Types.BaseOrder;
      try {
        this.params = normalize(p);
      } catch {
        throw new Error("Invalid params");
      }

      // Detect kind
      if (!p.kind) {
        this.params.kind = this.detectKind();
      }
    }
  }

  public getRaw() {
    if (this.isBatchSignedOrder()) {
      const params = this.asBatchSignedOrder();
      return {
        ...params,
        erc20Token: toContractERC20Address(params.erc20Token),
        collectionsBytes: toCollectionsBytes(params),
      };
    } else {
      return this.contractKind() == "erc721"
        ? toRawErc721Order(this.asBaseOrder())
        : toRawErc1155Order(this.asBaseOrder());
    }
  }

  public id() {
    return keccak256(
      defaultAbiCoder.encode(
        ["bytes32", "uint256"],
        [this.hash(), this.params.nonce]
      )
    );
  }

  public hash() {
    const [types, value] = this.getEip712TypesAndValue();
    return _TypedDataEncoder.hash(EIP712_DOMAIN(this.chainId), types, value);
  }

  public async sign(signer: TypedDataSigner) {
    const [types, value] = this.getEip712TypesAndValue();
    const { v, r, s } = splitSignature(
      await signer._signTypedData(EIP712_DOMAIN(this.chainId), types, value)
    );

    this.params = {
      ...this.params,
      v,
      r,
      s,
    };
    if (this.isBatchSignedOrder()) {
      this.asBatchSignedOrder().hash = _TypedDataEncoder.hash(
        EIP712_DOMAIN(this.chainId),
        types,
        value
      );
    } else {
      this.asBaseOrder().signatureType = 0;
    }
  }

  public getSignatureData() {
    const [types, value] = this.getEip712TypesAndValue();
    return {
      signatureKind: "eip712",
      domain: EIP712_DOMAIN(this.chainId),
      types,
      value,
    };
  }

  public checkSignature() {
    const [types, value] = this.getEip712TypesAndValue();

    const signer = verifyTypedData(EIP712_DOMAIN(this.chainId), types, value, {
      v: this.params.v,
      r: this.params.r ?? "",
      s: this.params.s ?? "",
    });

    if (lc(this.params.maker) !== lc(signer)) {
      throw new Error("Invalid signature");
    }
  }

  public checkValidity() {
    if (this.isBatchSignedOrder()) {
      if (this.hash() != this.asBatchSignedOrder().hash) {
        throw new Error("Invalid order");
      }
    } else {
      if (!this.getBuilder().isValid(this)) {
        throw new Error("Invalid order");
      }
    }
  }

  public getInfo(): BaseOrderInfo | undefined {
    return this.isBatchSignedOrder() ? {} : this.getBuilder().getInfo(this);
  }

  public async checkFillability(provider: Provider) {
    const chainId = await provider.getNetwork().then((n) => n.chainId);

    const exchange = new Contract(
      Addresses.Exchange[this.chainId],
      ExchangeAbi as any,
      provider
    );

    if (this.contractKind() == "erc721") {
      const hashNonce = await exchange.getHashNonce(this.params.maker);
      if (!bn(hashNonce).eq(this.params.hashNonce)) {
        throw new Error("not-fillable");
      }

      const nonceRange = bn(this.params.nonce).shr(8);
      const statusVector = await exchange.getERC721OrderStatusBitVector(
        this.params.maker,
        nonceRange
      );
      const nonceMask = bn(1).shl(bn(this.params.nonce).and(0xff).toNumber());
      if (!nonceMask.and(statusVector).isZero()) {
        throw new Error("not-fillable");
      }
    } else {
      const info =
        this.side() == "sell"
          ? await exchange.getERC1155SellOrderInfo(
              toRawErc1155Order(this.asBaseOrder())
            )
          : await exchange.getERC1155BuyOrderInfo(
              toRawErc1155Order(this.asBaseOrder())
            );
      if (
        !bn(info.status).eq(1) ||
        bn(info.remainingAmount).isZero() ||
        info.orderHash != this.hash()
      ) {
        throw new Error("not-fillable");
      }
    }

    if (this.side() == "buy") {
      // Check that maker has enough balance to cover the payment
      // and the approval to the token transfer proxy is set
      const erc20 = new Common.Helpers.Erc20(provider, this.params.erc20Token);
      const balance = await erc20.getBalance(this.params.maker);
      const totalPrice = this.getTotalPrice();
      if (bn(balance).lt(totalPrice)) {
        throw new Error("no-balance");
      }

      // Check allowance
      const allowance = await erc20.getAllowance(
        this.params.maker,
        Addresses.Exchange[chainId]
      );
      if (bn(allowance).lt(totalPrice)) {
        throw new Error("no-approval");
      }
    } else {
      if (this.contractKind() == "erc721") {
        const erc721 = new Common.Helpers.Erc721(provider, this.params.nft!);

        // Check ownership
        const owner = await erc721.getOwner(this.params.nftId!);
        if (lc(owner) !== lc(this.params.maker)) {
          throw new Error("no-balance");
        }

        // Check approval
        const isApproved = await erc721.isApproved(
          this.params.maker,
          Addresses.Exchange[this.chainId]
        );
        if (!isApproved) {
          throw new Error("no-approval");
        }
      } else {
        const params = this.asBaseOrder();
        const erc1155 = new Common.Helpers.Erc1155(provider, params.nft);

        // Check balance
        const balance = await erc1155.getBalance(params.maker, params.nftId);
        if (bn(balance).lt(params.nftAmount!)) {
          throw new Error("no-balance");
        }

        // Check approval
        const isApproved = await erc1155.isApproved(
          this.params.maker,
          Addresses.Exchange[this.chainId]
        );
        if (!isApproved) {
          throw new Error("no-approval");
        }
      }
    }
  }

  public buildMatching(data?: any) {
    if (this.isBatchSignedOrder()) {
      return {
        nftId: this.params.nftId,
        nftAmount: "1",
      };
    } else {
      return this.getBuilder().buildMatching(this, data);
    }
  }

  public isBatchSignedOrder(
    params?: Types.BaseOrder | Types.BatchSignedOrder
  ): boolean {
    // @ts-ignore
    return (params ?? this.params).startNonce != null;
  }

  public getTotalPrice(quantity?: BigNumberish): BigNumber {
    if (this.isBatchSignedOrder()) {
      return bn(this.params.erc20TokenAmount!);
    } else {
      const params = this.asBaseOrder();
      if (this.contractKind() == "erc721") {
        return bn(params.erc20TokenAmount).add(this.getFeeAmount());
      } else {
        const fillQuantity = quantity != null ? quantity : params.nftAmount!;
        const erc20Amount =
          this.side() == "sell"
            ? ceilDiv(
                bn(params.erc20TokenAmount).mul(fillQuantity),
                params.nftAmount!
              )
            : bn(params.erc20TokenAmount)
                .mul(fillQuantity)
                .div(params.nftAmount!);
        return erc20Amount.add(this.getFeeAmount(fillQuantity));
      }
    }
  }

  public getFeeAmount(quantity?: BigNumberish): BigNumber {
    if (this.isBatchSignedOrder()) {
      const params = this.asBatchSignedOrder();
      const platformFee = bn(params.erc20TokenAmount!)
        .mul(params.platformFee!)
        .div(10000);
      const royaltyFee = bn(params.erc20TokenAmount!)
        .mul(params.royaltyFee!)
        .div(10000);
      return platformFee.add(royaltyFee);
    } else {
      const params = this.asBaseOrder();
      if (this.contractKind() == "erc721") {
        return calcFeeAmount(params, "1", "1");
      } else {
        const fillQuantity = quantity != null ? quantity : params.nftAmount!;
        return calcFeeAmount(params, fillQuantity, params.nftAmount!);
      }
    }
  }

  public listingTime(): number {
    if (this.isBatchSignedOrder()) {
      return this.asBatchSignedOrder().listingTime;
    } else {
      return bn(this.asBaseOrder().expiry).shr(32).and(0xffffffff).toNumber();
    }
  }

  public expirationTime(): number {
    if (this.isBatchSignedOrder()) {
      return this.asBatchSignedOrder().expirationTime;
    } else {
      return bn(this.asBaseOrder().expiry).and(0xffffffff).toNumber();
    }
  }

  public erc20Token(): string {
    return toStandardERC20Address(this.params.erc20Token);
  }

  public side(): string {
    if (this.isBatchSignedOrder()) {
      return "sell";
    } else {
      return this.asBaseOrder().direction === Types.TradeDirection.SELL
        ? "sell"
        : "buy";
    }
  }

  public orderKind(): string | undefined {
    if (this.isBatchSignedOrder()) {
      return "single-token";
    } else {
      return this.asBaseOrder().kind?.split("-").slice(1).join("-");
    }
  }

  public contractKind(): string | undefined {
    if (this.isBatchSignedOrder()) {
      return "erc721";
    } else {
      return this.asBaseOrder().kind?.split("-")[0];
    }
  }

  private getEip712TypesAndValue() {
    if (this.isBatchSignedOrder()) {
      return [
        BATCH_SIGNED_ORDER_EIP712_TYPES,
        toRawBatchSignedOrder(this.asBatchSignedOrder()),
        "BatchSignedERC721Orders",
      ];
    } else {
      const params = this.asBaseOrder();
      if (!params.nftAmount) {
        if (this.side() == "sell") {
          return [
            NFT_SELL_ORDER_EIP712_TYPES,
            toRawErc721Order(params),
            "NFTSellOrder",
          ];
        } else {
          return [
            NFT_BUY_ORDER_EIP712_TYPES,
            toRawErc721Order(params),
            "NFTBuyOrder",
          ];
        }
      } else {
        if (this.side() == "sell") {
          return [
            ERC1155_SELL_ORDER_EIP712_TYPES,
            toRawErc1155Order(params),
            "ERC1155SellOrder",
          ];
        } else {
          return [
            ERC1155_BUY_ORDER_EIP712_TYPES,
            toRawErc1155Order(params),
            "ERC1155BuyOrder",
          ];
        }
      }
    }
  }

  private getBuilder(): BaseBuilder {
    if (!this.isBatchSignedOrder()) {
      switch (this.asBaseOrder().kind) {
        case "erc721-contract-wide":
        case "erc1155-contract-wide": {
          return new Builders.ContractWide(this.chainId);
        }

        case "erc721-single-token":
        case "erc1155-single-token": {
          return new Builders.SingleToken(this.chainId);
        }
      }
    }
    throw new Error("Unknown order kind");
  }

  private detectKind(): Types.OrderKind {
    const params = this.asBaseOrder();
    // contract-wide
    {
      const builder = new Builders.ContractWide(this.chainId);
      if (builder.isValid(this)) {
        return params.nftAmount
          ? "erc1155-contract-wide"
          : "erc721-contract-wide";
      }
    }

    // single-token
    {
      const builder = new Builders.SingleToken(this.chainId);
      if (builder.isValid(this)) {
        return params.nftAmount
          ? "erc1155-single-token"
          : "erc721-single-token";
      }
    }

    throw new Error(
      "Could not detect order kind (order might have unsupported params/calldata)"
    );
  }

  private asBatchSignedOrder(): Types.BatchSignedOrder {
    return this.params as Types.BatchSignedOrder;
  }

  private asBaseOrder(): Types.BaseOrder {
    return this.params as Types.BaseOrder;
  }
}

const EIP712_DOMAIN = (chainId: number) => ({
  name: "ElementEx",
  version: "1.0.0",
  chainId,
  verifyingContract: Addresses.Exchange[chainId],
});

const NFT_BUY_ORDER_EIP712_TYPES = {
  Fee: [
    { name: "recipient", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "feeData", type: "bytes" },
  ],
  Property: [
    { name: "propertyValidator", type: "address" },
    { name: "propertyData", type: "bytes" },
  ],
  NFTBuyOrder: [
    { type: "address", name: "maker" },
    { type: "address", name: "taker" },
    { type: "uint256", name: "expiry" },
    { type: "uint256", name: "nonce" },
    { type: "address", name: "erc20Token" },
    { type: "uint256", name: "erc20TokenAmount" },
    { type: "Fee[]", name: "fees" },
    { type: "address", name: "nft" },
    { type: "uint256", name: "nftId" },
    { type: "Property[]", name: "nftProperties" },
    { type: "uint256", name: "hashNonce" },
  ],
};

const NFT_SELL_ORDER_EIP712_TYPES = {
  NFTSellOrder: [
    { type: "address", name: "maker" },
    { type: "address", name: "taker" },
    { type: "uint256", name: "expiry" },
    { type: "uint256", name: "nonce" },
    { type: "address", name: "erc20Token" },
    { type: "uint256", name: "erc20TokenAmount" },
    { type: "Fee[]", name: "fees" },
    { type: "address", name: "nft" },
    { type: "uint256", name: "nftId" },
    { type: "uint256", name: "hashNonce" },
  ],
  Fee: [
    { name: "recipient", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "feeData", type: "bytes" },
  ],
};

const ERC1155_BUY_ORDER_EIP712_TYPES = {
  ERC1155BuyOrder: [
    { name: "maker", type: "address" },
    { name: "taker", type: "address" },
    { name: "expiry", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "erc20Token", type: "address" },
    { name: "erc20TokenAmount", type: "uint256" },
    { name: "fees", type: "Fee[]" },
    { name: "erc1155Token", type: "address" },
    { name: "erc1155TokenId", type: "uint256" },
    { name: "erc1155TokenProperties", type: "Property[]" },
    { name: "erc1155TokenAmount", type: "uint128" },
    { type: "uint256", name: "hashNonce" },
  ],
  Fee: [
    { name: "recipient", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "feeData", type: "bytes" },
  ],
  Property: [
    { name: "propertyValidator", type: "address" },
    { name: "propertyData", type: "bytes" },
  ],
};

const ERC1155_SELL_ORDER_EIP712_TYPES = {
  ERC1155SellOrder: [
    { name: "maker", type: "address" },
    { name: "taker", type: "address" },
    { name: "expiry", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "erc20Token", type: "address" },
    { name: "erc20TokenAmount", type: "uint256" },
    { name: "fees", type: "Fee[]" },
    { name: "erc1155Token", type: "address" },
    { name: "erc1155TokenId", type: "uint256" },
    { name: "erc1155TokenAmount", type: "uint128" },
    { name: "hashNonce", type: "uint256" },
  ],
  Fee: [
    { name: "recipient", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "feeData", type: "bytes" },
  ],
};

const BATCH_SIGNED_ORDER_EIP712_TYPES = {
  BatchSignedERC721Orders: [
    { type: "address", name: "maker" },
    { type: "uint256", name: "listingTime" },
    { type: "uint256", name: "expiryTime" },
    { type: "uint256", name: "startNonce" },
    { type: "address", name: "erc20Token" },
    { type: "address", name: "platformFeeRecipient" },
    { type: "BasicCollection[]", name: "basicCollections" },
    { type: "Collection[]", name: "collections" },
    { type: "uint256", name: "hashNonce" },
  ],
  BasicCollection: [
    { type: "address", name: "nftAddress" },
    { type: "bytes32", name: "fee" },
    { type: "bytes32[]", name: "items" },
  ],
  Collection: [
    { type: "address", name: "nftAddress" },
    { type: "bytes32", name: "fee" },
    { type: "OrderItem[]", name: "items" },
  ],
  OrderItem: [
    { type: "uint256", name: "erc20TokenAmount" },
    { type: "uint256", name: "nftId" },
  ],
};

const toRawErc721Order = (params: Types.BaseOrder): any => {
  return {
    ...params,
    erc721Token: params.nft,
    erc721TokenId: params.nftId,
    erc721TokenProperties: params.nftProperties,
    erc20Token: toContractERC20Address(params.erc20Token),
  };
};

const toRawErc1155Order = (params: Types.BaseOrder): any => {
  return {
    ...params,
    erc1155Token: params.nft,
    erc1155TokenId: params.nftId,
    erc1155TokenProperties: params.nftProperties,
    erc1155TokenAmount: params.nftAmount,
    erc20Token: toContractERC20Address(params.erc20Token),
  };
};

const toRawBatchSignedOrder = (params: Types.BatchSignedOrder): any => {
  return {
    maker: params.maker,
    listingTime: params.listingTime,
    expiryTime: params.expirationTime,
    startNonce: params.startNonce,
    erc20Token: toContractERC20Address(params.erc20Token),
    platformFeeRecipient: params.platformFeeRecipient,
    basicCollections: toRawCollections(params.basicCollections, true),
    collections: toRawCollections(params.collections, false),
    hashNonce: params.hashNonce,
  };
};

const toRawCollections = (
  collections: Types.Collection[],
  isBasic: boolean
) => {
  const list: any[] = [];
  for (const collection of collections) {
    const items: any[] = [];
    for (const item of collection.items) {
      if (isBasic) {
        // item [96 bits(erc20TokenAmount) + 160 bits(nftId)].
        items.push(
          toHexZeroPad(bn(item.erc20TokenAmount).shl(160).or(item.nftId), true)
        );
      } else {
        items.push({
          erc20TokenAmount: toHexZeroPad(bn(item.erc20TokenAmount), true),
          nftId: toHexZeroPad(bn(item.nftId), true),
        });
      }
    }

    // fee [16 bits(platformFeePercentage) + 16 bits(royaltyFeePercentage) + 160 bits(royaltyFeeRecipient)].
    const fee = bn(collection.platformFee)
      .shl(176)
      .or(bn(collection.royaltyFee).shl(160))
      .or(bn(collection.royaltyFeeRecipient));

    list.push({
      nftAddress: collection.nftAddress,
      fee: toHexZeroPad(fee, true),
      items: items,
    });
  }
  return list;
};

const normalize = (order: Types.BaseOrder): Types.BaseOrder => {
  // Perform some normalization operations on the order:
  // - convert bignumbers to strings where needed
  // - convert strings to numbers where needed
  // - lowercase all strings
  return {
    kind: order.kind,
    direction: order.direction,
    maker: lc(order.maker),
    taker: lc(order.taker),
    expiry: s(order.expiry),
    nonce: s(order.nonce),
    hashNonce: s(order.hashNonce),
    erc20Token: toStandardERC20Address(order.erc20Token),
    erc20TokenAmount: s(order.erc20TokenAmount),
    fees: order.fees.map(({ recipient, amount, feeData }) => ({
      recipient: lc(recipient),
      amount: s(amount),
      feeData: lc(feeData),
    })),
    nft: lc(order.nft),
    nftId: s(order.nftId),
    nftProperties: order.nftProperties.map(
      ({ propertyValidator, propertyData }) => ({
        propertyValidator: lc(propertyValidator),
        propertyData: lc(propertyData),
      })
    ),
    nftAmount: order.nftAmount ? s(order.nftAmount) : undefined,
    signatureType: order.signatureType ?? 0,
    v: order.v ?? 0,
    r: order.r ?? HashZero,
    s: order.s ?? HashZero,
  };
};

const normalizeBatchSignedOrder = (
  order: Types.BatchSignedOrder
): Types.BatchSignedOrder => {
  const normalizeOrder: Types.BatchSignedOrder = {
    maker: lc(order.maker),
    listingTime: toNumber(order.listingTime, 2 ** 32),
    expirationTime: toNumber(order.expirationTime, 2 ** 32),
    startNonce: toNumber(order.startNonce, 2 ** 48),
    erc20Token: toStandardERC20Address(order.erc20Token),
    platformFeeRecipient: lc(order.platformFeeRecipient),
    basicCollections: normalizeCollections(order.basicCollections),
    collections: normalizeCollections(order.collections),
    hashNonce: s(order.hashNonce),
    hash: lc(order.hash),
    v: toNumber(order.v, 256),
    r: lc(order.r),
    s: lc(order.s),
    nonce: toNumber(order.nonce, 2 ** 48),
  };
  return Object.assign(normalizeOrder, getCurrentOrderInfo(normalizeOrder));
};

const getCurrentOrderInfo = (order: Types.BatchSignedOrder): any => {
  let nonce = order.startNonce;
  for (const collection of order.basicCollections) {
    let endNonce = nonce + collection.items.length;
    if (order.nonce >= nonce && order.nonce < endNonce) {
      return toOrderInfo(collection, order.nonce - nonce);
    }
    nonce = endNonce;
  }
  for (const collection of order.collections) {
    let endNonce = nonce + collection.items.length;
    if (order.nonce >= nonce && order.nonce < endNonce) {
      return toOrderInfo(collection, order.nonce - nonce);
    }
    nonce = endNonce;
  }
  throw new Error("Invalid params");
};

const toOrderInfo = (collection: Types.Collection, i: number): any => {
  if (collection.platformFee + collection.royaltyFee > 10000) {
    throw new Error("Invalid params");
  }
  return {
    nft: collection.nftAddress,
    nftId: collection.items[i].nftId,
    erc20TokenAmount: collection.items[i].erc20TokenAmount,
    platformFee: collection.platformFee,
    royaltyFeeRecipient: collection.royaltyFeeRecipient,
    royaltyFee: collection.royaltyFee,
  };
};

const normalizeCollections = (
  collections: Types.Collection[]
): Types.Collection[] => {
  return (
    collections?.map((value) => {
      return {
        nftAddress: lc(value.nftAddress),
        platformFee: toNumber(value.platformFee, 10001),
        royaltyFeeRecipient: lc(value.royaltyFeeRecipient),
        royaltyFee: toNumber(value.royaltyFee, 10001),
        items:
          value.items?.map((item) => {
            return {
              erc20TokenAmount: s(item.erc20TokenAmount),
              nftId: s(item.nftId),
            };
          }) ?? [],
      };
    }) ?? []
  );
};

const toCollectionsBytes = (order: Types.BatchSignedOrder): string => {
  let bytes = "0x";
  let currentNonce = order.startNonce;
  if (order.basicCollections?.length) {
    for (const collection of order.basicCollections) {
      bytes += toCollectionBytes(true, collection, order.nonce, currentNonce);
      currentNonce += collection.items.length;
    }
  }
  if (order.collections?.length) {
    for (const collection of order.collections) {
      bytes += toCollectionBytes(false, collection, order.nonce, currentNonce);
      currentNonce += collection.items.length;
    }
  }
  return bytes;
};

const toCollectionBytes = (
  isBasic: boolean,
  collection: Types.Collection,
  orderNonce: number,
  nonce: number
): string => {
  let filledIndex = 0;
  let filledCount = 0;
  for (let i = 0; i < collection.items.length; i++, nonce++) {
    if (nonce == orderNonce) {
      filledIndex = i;
      filledCount = 1;
      break;
    }
  }

  // head1 [96 bits(filledIndexList part1) + 160 bits(nftAddress)]
  // Here, the leftmost 1 byte is used for filledIndex, so `filledIndex << 248`.
  const head1 = bn(filledIndex).shl(248).or(collection.nftAddress);

  // head2 [8 bits(collectionType) + 8 bits(itemsCount) + 8 bits(filledCount) + 8 bits(unused) + 32 bits(filledIndexList part2)
  //        + 16 bits(platformFeePercentage) + 16 bits(royaltyFeePercentage) + 160 bits(royaltyFeeRecipient)]
  const head2 = bn(isBasic ? 0 : 1)
    .shl(248)
    .or(bn(collection.items.length).shl(240))
    .or(bn(filledCount).shl(232))
    .or(bn(collection.platformFee).shl(176))
    .or(bn(collection.royaltyFee).shl(160))
    .or(collection.royaltyFeeRecipient);

  let bytes = toHexZeroPad(head1) + toHexZeroPad(head2);
  if (isBasic) {
    for (const item of collection.items) {
      // item [96 bits(erc20TokenAmount) + 160 bits(nftId)].
      bytes += toHexZeroPad(bn(item.erc20TokenAmount).shl(160).or(item.nftId));
    }
  } else {
    for (const item of collection.items) {
      bytes +=
        toHexZeroPad(bn(item.erc20TokenAmount)) + toHexZeroPad(bn(item.nftId));
    }
  }
  return bytes;
};

const toHexZeroPad = (value: BigNumber, withPrefix?: boolean): string => {
  const hex = hexZeroPad(value.and(MaxUint256).toHexString(), 32);
  return withPrefix ? hex : hex.substring(2);
};

const toNumber = (number: any, limit: number) => {
  const val = Number(number);
  if (isNaN(val) && val >= limit) {
    throw new Error("Invalid number");
  }
  return val;
};

const toStandardERC20Address = (address: string): string => {
  if (!address || lc(address) == Addresses.NativeEthAddress) {
    return AddressZero;
  }
  return lc(address);
};

const toContractERC20Address = (address: string): string => {
  if (!address || lc(address) == AddressZero) {
    return Addresses.NativeEthAddress;
  }
  return lc(address);
};

const calcFeeAmount = (
  order: Types.BaseOrder,
  quantity: BigNumberish,
  totalQuantity: BigNumberish
): BigNumber => {
  let value = bn(0);
  for (const fee of order.fees) {
    const amount = bn(fee.amount).mul(quantity).div(totalQuantity);
    value = value.add(amount);
  }
  return value;
};

const ceilDiv = (a: BigNumber, b: BigNumberish): BigNumber => {
  // ceil(a / b) = floor((a + b - 1) / b)
  return a.add(b).sub(1).div(b);
};
