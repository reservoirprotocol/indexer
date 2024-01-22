import { Provider } from "@ethersproject/abstract-provider";
import { TypedDataSigner } from "@ethersproject/abstract-signer";
import { BigNumberish } from "@ethersproject/bignumber";
import { splitSignature } from "@ethersproject/bytes";
import { HashZero, AddressZero } from "@ethersproject/constants";
import { Contract } from "@ethersproject/contracts";
import { _TypedDataEncoder } from "@ethersproject/hash";
import { verifyTypedData } from "@ethersproject/wallet";

import * as Addresses from "./addresses";
import { Builders } from "./builders";
import { BaseBuilder, MatchingOptions } from "./builders/base";
import * as Types from "./types";
import * as Common from "../common";
import { lc, s, n, bn, getCurrentTimestamp } from "../utils";

import ExchangeAbi from "./abis/Exchange.json";

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
    return [
      "item-offer-approval",
      "collection-offer-approval",
      "token-set-offer-approval",
    ].includes(this.params.kind!);
  }

  public isCosignedOrder() {
    return this.params.cosigner !== AddressZero;
  }

  public isCollectionLevelOffer() {
    return ["collection-offer-approval", "token-set-offer-approval"].includes(this.params.kind!);
  }

  public isPartial() {
    return this.params.protocol === Types.OrderProtocols.ERC1155_FILL_PARTIAL;
  }

  public checkValidity() {
    if (!this.getBuilder().isValid(this)) {
      throw new Error("Invalid order");
    }
  }

  private detectKind(): Types.OrderKind {
    const params = this.params;

    if (
      params.maxRoyaltyFeeNumerator !== undefined &&
      params.beneficiary === undefined &&
      params.tokenId !== undefined
    ) {
      return "sale-approval";
    }

    if (
      params.maxRoyaltyFeeNumerator === undefined &&
      params.beneficiary !== undefined &&
      params.tokenId !== undefined
    ) {
      return "item-offer-approval";
    }

    if (
      params.maxRoyaltyFeeNumerator === undefined &&
      params.beneficiary !== undefined &&
      params.tokenId === undefined &&
      params.tokenSetMerkleRoot === undefined
    ) {
      return "collection-offer-approval";
    }

    if (params.tokenSetMerkleRoot !== undefined) {
      return "token-set-offer-approval";
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

  public async cosign(cosigner: TypedDataSigner, taker: string) {
    const cosignature = {
      signer: this.params.cosigner!,
      taker,
      expiration: getCurrentTimestamp(90),
      v: this.params.v!,
      r: this.params.r!,
      s: this.params.s!,
    };

    const signature = await cosigner._signTypedData(
      EIP712_DOMAIN(this.chainId),
      EIP712_COSIGNATURE_TYPES,
      cosignature
    );
    const { r, s, v } = splitSignature(signature);

    this.params.cosignature = {
      ...cosignature,
      r,
      s,
      v,
    };
  }

  public getCosignature() {
    return (
      this.params.cosignature ?? {
        signer: AddressZero,
        taker: AddressZero,
        expiration: 0,
        v: 0,
        r: HashZero,
        s: HashZero,
      }
    );
  }

  public getTokenSetProof() {
    return {
      rootHash: this.params.tokenSetMerkleRoot ?? HashZero,
      proof: this.params.tokenSetProof ?? [],
    };
  }

  public getMatchedOrder(
    taker: string,
    options?: {
      amount?: BigNumberish;
      tokenId?: BigNumberish;
      maxRoyaltyFeeNumerator?: BigNumberish;
    }
  ): Types.MatchedOrder {
    const isBuyOrder = this.isBuyOrder();
    const params = this.params;

    return {
      protocol: params.protocol,
      maker: params.sellerOrBuyer,
      beneficiary: isBuyOrder ? params.beneficiary! : taker,
      marketplace: params.marketplace,
      fallbackRoyaltyRecipient: params.fallbackRoyaltyRecipient ?? AddressZero,
      paymentMethod: params.paymentMethod,
      tokenAddress: params.tokenAddress,
      tokenId: options?.tokenId?.toString() ?? params.tokenId!,
      amount: params.amount,
      itemPrice: params.itemPrice,
      nonce: params.nonce,
      expiration: params.expiration,
      marketplaceFeeNumerator: params.marketplaceFeeNumerator,
      maxRoyaltyFeeNumerator:
        options?.maxRoyaltyFeeNumerator?.toString() ?? params.maxRoyaltyFeeNumerator ?? "0",
      requestedFillAmount: options?.amount ? options.amount.toString() : "0",
      minimumFillAmount: options?.amount ? options.amount.toString() : "0",
      signature: {
        r: this.params.r!,
        s: this.params.s!,
        v: this.params.v!,
      },
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
      throw new Error("Invalid signature");
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
      if (this.params.protocol === Types.OrderProtocols.ERC721_FILL_OR_KILL) {
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
      } else if (
        [
          Types.OrderProtocols.ERC1155_FILL_OR_KILL,
          Types.OrderProtocols.ERC1155_FILL_PARTIAL,
        ].includes(this.params.protocol)
      ) {
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
      const totalPrice = this.params.itemPrice;

      // Check that maker has enough balance to cover the payment and the approval is correctly set
      const erc20 = new Common.Helpers.Erc20(provider, this.params.paymentMethod);
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
        cosigner: this.params.cosigner ?? AddressZero,
        seller: this.params.sellerOrBuyer,
        marketplace: this.params.marketplace,
        fallbackRoyaltyRecipient: this.params.fallbackRoyaltyRecipient ?? AddressZero,
        paymentMethod: this.params.paymentMethod,
        tokenAddress: this.params.tokenAddress,
        tokenId: this.params.tokenId!,
        amount: this.params.amount,
        itemPrice: this.params.itemPrice,
        expiration: this.params.expiration,
        marketplaceFeeNumerator: this.params.marketplaceFeeNumerator,
        maxRoyaltyFeeNumerator: this.params.maxRoyaltyFeeNumerator!,
        nonce: this.params.nonce,
        masterNonce: this.params.masterNonce,
      };
      return [EIP712_SALE_APPROVAL_TYPES, listing, "SaleApproval"];
    } else if (this.params.kind === "item-offer-approval") {
      const offer: Types.ItemOfferApproval = {
        protocol: this.params.protocol,
        cosigner: this.params.cosigner ?? AddressZero,
        buyer: this.params.sellerOrBuyer,
        beneficiary: this.params.beneficiary!,
        marketplace: this.params.marketplace,
        fallbackRoyaltyRecipient: this.params.fallbackRoyaltyRecipient ?? AddressZero,
        paymentMethod: this.params.paymentMethod,
        tokenAddress: this.params.tokenAddress,
        tokenId: this.params.tokenId!,
        amount: this.params.amount,
        itemPrice: this.params.itemPrice,
        expiration: this.params.expiration,
        marketplaceFeeNumerator: this.params.marketplaceFeeNumerator,
        nonce: this.params.nonce,
        masterNonce: this.params.masterNonce,
      };
      return [EIP712_ITEM_OFFER_APPROVAL_TYPES, offer, "ItemOfferApproval"];
    } else if (this.params.kind === "collection-offer-approval") {
      const collectionOffer: Types.CollectionOfferApproval = {
        protocol: this.params.protocol,
        cosigner: this.params.cosigner ?? AddressZero,
        buyer: this.params.sellerOrBuyer,
        beneficiary: this.params.beneficiary!,
        marketplace: this.params.marketplace,
        fallbackRoyaltyRecipient: this.params.fallbackRoyaltyRecipient ?? AddressZero,
        paymentMethod: this.params.paymentMethod,
        tokenAddress: this.params.tokenAddress,
        amount: this.params.amount,
        itemPrice: this.params.itemPrice,
        expiration: this.params.expiration,
        marketplaceFeeNumerator: this.params.marketplaceFeeNumerator,
        nonce: this.params.nonce,
        masterNonce: this.params.masterNonce,
      };
      return [EIP712_COLLECTION_OFFER_APPROVAL_TYPES, collectionOffer, "CollectionOfferApproval"];
    } else if (this.params.kind === "token-set-offer-approval") {
      const bundleOffer: Types.TokenSetOfferApproval = {
        protocol: this.params.protocol,
        cosigner: this.params.cosigner ?? AddressZero,
        buyer: this.params.sellerOrBuyer,
        beneficiary: this.params.beneficiary!,
        marketplace: this.params.marketplace,
        fallbackRoyaltyRecipient: this.params.fallbackRoyaltyRecipient ?? AddressZero,
        paymentMethod: this.params.paymentMethod,
        tokenAddress: this.params.tokenAddress,
        amount: this.params.amount,
        itemPrice: this.params.itemPrice,
        expiration: this.params.expiration,
        marketplaceFeeNumerator: this.params.marketplaceFeeNumerator,
        nonce: this.params.nonce,
        masterNonce: this.params.masterNonce,
        tokenSetMerkleRoot: this.params.tokenSetMerkleRoot!,
      };
      return [EIP712_TOKEN_SET_OFFER_APPROVAL_TYPES, bundleOffer, "TokenSetOfferApproval"];
    }
  }

  private getBuilder(): BaseBuilder {
    switch (this.params.kind) {
      case "item-offer-approval":
      case "sale-approval": {
        return new Builders.SingleToken(this.chainId);
      }

      case "collection-offer-approval": {
        return new Builders.ContractWide(this.chainId);
      }

      case "token-set-offer-approval": {
        return new Builders.TokenList(this.chainId);
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
    { name: "cosigner", type: "address" },
    { name: "seller", type: "address" },
    { name: "marketplace", type: "address" },
    { name: "fallbackRoyaltyRecipient", type: "address" },
    { name: "paymentMethod", type: "address" },
    { name: "tokenAddress", type: "address" },
    { name: "tokenId", type: "uint256" },
    { name: "amount", type: "uint256" },
    { name: "itemPrice", type: "uint256" },
    { name: "expiration", type: "uint256" },
    { name: "marketplaceFeeNumerator", type: "uint256" },
    { name: "maxRoyaltyFeeNumerator", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "masterNonce", type: "uint256" },
  ],
};

export const EIP712_ITEM_OFFER_APPROVAL_TYPES = {
  ItemOfferApproval: [
    { name: "protocol", type: "uint8" },
    { name: "cosigner", type: "address" },
    { name: "buyer", type: "address" },
    { name: "beneficiary", type: "address" },
    { name: "marketplace", type: "address" },
    { name: "fallbackRoyaltyRecipient", type: "address" },
    { name: "paymentMethod", type: "address" },
    { name: "tokenAddress", type: "address" },
    { name: "tokenId", type: "uint256" },
    { name: "amount", type: "uint256" },
    { name: "itemPrice", type: "uint256" },
    { name: "expiration", type: "uint256" },
    { name: "marketplaceFeeNumerator", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "masterNonce", type: "uint256" },
  ],
};

export const EIP712_COLLECTION_OFFER_APPROVAL_TYPES = {
  CollectionOfferApproval: [
    { name: "protocol", type: "uint8" },
    { name: "cosigner", type: "address" },
    { name: "buyer", type: "address" },
    { name: "beneficiary", type: "address" },
    { name: "marketplace", type: "address" },
    { name: "fallbackRoyaltyRecipient", type: "address" },
    { name: "paymentMethod", type: "address" },
    { name: "tokenAddress", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "itemPrice", type: "uint256" },
    { name: "expiration", type: "uint256" },
    { name: "marketplaceFeeNumerator", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "masterNonce", type: "uint256" },
  ],
};

export const EIP712_TOKEN_SET_OFFER_APPROVAL_TYPES = {
  TokenSetOfferApproval: [
    { name: "protocol", type: "uint8" },
    { name: "cosigner", type: "address" },
    { name: "buyer", type: "address" },
    { name: "beneficiary", type: "address" },
    { name: "marketplace", type: "address" },
    { name: "fallbackRoyaltyRecipient", type: "address" },
    { name: "paymentMethod", type: "address" },
    { name: "tokenAddress", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "itemPrice", type: "uint256" },
    { name: "expiration", type: "uint256" },
    { name: "marketplaceFeeNumerator", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "masterNonce", type: "uint256" },
    { name: "tokenSetMerkleRoot", type: "bytes32" },
  ],
};

export const EIP712_COSIGNATURE_TYPES = {
  Cosignature: [
    { name: "v", type: "uint8" },
    { name: "r", type: "bytes32" },
    { name: "s", type: "bytes32" },
    { name: "expiration", type: "uint256" },
    { name: "taker", type: "address" },
  ],
};

export const EIP712_DOMAIN = (chainId: number) => ({
  name: "PaymentProcessor",
  version: "2",
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
    cosigner: lc(order.cosigner ?? AddressZero),
    sellerOrBuyer: lc(order.sellerOrBuyer),
    marketplace: lc(order.marketplace),
    paymentMethod: lc(order.paymentMethod),
    tokenAddress: lc(order.tokenAddress),
    amount: s(order.amount),
    itemPrice: s(order.itemPrice),
    expiration: s(order.expiration),
    marketplaceFeeNumerator: s(order.marketplaceFeeNumerator),
    nonce: s(order.nonce),
    masterNonce: s(order.masterNonce),
    fallbackRoyaltyRecipient:
      order.fallbackRoyaltyRecipient !== undefined ? lc(order.fallbackRoyaltyRecipient) : undefined,
    maxRoyaltyFeeNumerator:
      order.maxRoyaltyFeeNumerator !== undefined ? s(order.maxRoyaltyFeeNumerator) : undefined,

    beneficiary: order.beneficiary !== undefined ? lc(order.beneficiary) : undefined,

    tokenId: order.tokenId !== undefined ? s(order.tokenId) : undefined,

    tokenSetMerkleRoot:
      order.tokenSetMerkleRoot !== undefined ? lc(order.tokenSetMerkleRoot) : undefined,
    seaportStyleMerkleRoot:
      order.seaportStyleMerkleRoot !== undefined ? lc(order.seaportStyleMerkleRoot) : undefined,

    v: order.v ?? 0,
    r: order.r ?? HashZero,
    s: order.s ?? HashZero,
  };
};
