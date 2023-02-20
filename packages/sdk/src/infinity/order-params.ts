import * as Types from "./types";
import * as Errors from "./errors";
import { bn, lc, s } from "../utils";
import { Signature, TypedDataField } from "ethers";
import { SignatureLike } from "@ethersproject/bytes";
import { defaultAbiCoder, verifyTypedData } from "ethers/lib/utils";
import { AddressZero } from "@ethersproject/constants";

export class OrderParams implements Types.OrderInput {
  protected _params: Types.InternalOrder;
  protected _sig?: string;

  protected get _domain() {
    return {
      name: "InfinityComplication",
      version: "1",
      chainId: this.chainId,
      verifyingContract: this.complication,
    };
  }

  get kind(): Types.OrderKind {
    if (this._isSingleToken) {
      return "single-token";
    } else if (this._isContractWide) {
      return "contract-wide";
    }
    return "complex";
  }

  get chainId() {
    return this._chainId;
  }

  set chainId(chainId: number) {
    this._chainId = chainId;
  }

  get isSellOrder(): Types.OrderInput["isSellOrder"] {
    return this._params.isSellOrder;
  }

  set isSellOrder(isSellOrder: Types.OrderInput["isSellOrder"]) {
    if (this.isSellOrder !== isSellOrder) {
      this._params.isSellOrder = isSellOrder;
    }
  }

  get signer(): Types.OrderInput["signer"] {
    return this._params.signer;
  }

  set signer(signer: Types.OrderInput["signer"]) {
    const formattedSigner = lc(signer);
    this._params.signer = formattedSigner;
  }

  get taker(): string {
    return AddressZero; // taker is not currently supported
  }

  get numItems(): Types.OrderInput["numItems"] {
    return parseInt(this._params.constraints[0]);
  }

  set numItems(numItems: Types.OrderInput["numItems"]) {
    const formattedNumItems = s(numItems);
    this._params.constraints[0] = formattedNumItems;
  }

  get startPrice(): Types.OrderInput["startPrice"] {
    return this._params.constraints[1];
  }

  set startPrice(startPrice: Types.OrderInput["startPrice"]) {
    this._params.constraints[1] = startPrice;
  }

  get endPrice(): Types.OrderInput["endPrice"] {
    return this._params.constraints[2];
  }

  set endPrice(endPrice: Types.OrderInput["endPrice"]) {
    this._params.constraints[2] = endPrice;
  }

  get startTime(): Types.OrderInput["startTime"] {
    return Number(this._params.constraints[3]);
  }

  set startTime(startTime: Types.OrderInput["startTime"]) {
    const formattedStartTime = s(startTime);
    this._params.constraints[3] = formattedStartTime;
  }

  get endTime(): Types.OrderInput["endTime"] {
    return Number(this._params.constraints[4]);
  }

  set endTime(endTime: Types.OrderInput["endTime"]) {
    const formattedEndTime = s(endTime);
    this._params.constraints[4] = formattedEndTime;
  }

  get nonce(): Types.OrderInput["nonce"] {
    return this._params.constraints[5];
  }

  set nonce(nonce: Types.OrderInput["nonce"]) {
    this._params.constraints[5] = nonce;
  }

  get maxGasPrice(): Types.OrderInput["maxGasPrice"] {
    return this._params.constraints[6];
  }

  set maxGasPrice(maxGasPrice: Types.OrderInput["maxGasPrice"]) {
    this._params.constraints[6] = maxGasPrice;
  }

  get nfts(): Types.OrderInput["nfts"] {
    return this._params.nfts;
  }

  set nfts(nfts: Types.OrderInput["nfts"]) {
    this._params.nfts = normalizeNfts(nfts);
  }

  get complication(): Types.OrderInput["complication"] {
    return this._params.execParams[0];
  }

  set complication(complication: Types.OrderInput["complication"]) {
    const formattedComplication = lc(complication);
    this._params.execParams[0] = formattedComplication;
  }

  get extraParams(): Types.OrderInput["extraParams"] {
    return this._params.extraParams;
  }

  set extraParams(extraParams: Types.OrderInput["extraParams"]) {
    this._params.extraParams = extraParams;
  }

  get currency(): Types.OrderInput["currency"] {
    return this._params.execParams[1];
  }

  set currency(currency: Types.OrderInput["currency"]) {
    const formattedCurrency = lc(currency);
    this._params.execParams[1] = formattedCurrency;
  }

  get sig(): string {
    if (!this._sig) {
      throw new Error("Order is not signed");
    }
    return this._sig;
  }

  set sig(signature: string | Signature | { v: number; r: string; s: string }) {
    let encodedSignature: string;
    if (typeof signature === "string") {
      encodedSignature = signature;
    } else {
      encodedSignature = this._getEncodedSig(signature);
    }
    this._verifySig(encodedSignature);
    this._sig = encodedSignature;
  }

  get params(): Types.OrderInput {
    return {
      isSellOrder: this.isSellOrder,
      signer: this.signer,
      numItems: this.numItems,
      startPrice: this.startPrice,
      endPrice: this.endPrice,
      startTime: this.startTime,
      endTime: this.endTime,
      nonce: this.nonce,
      maxGasPrice: this.maxGasPrice,
      nfts: this.nfts,
      complication: this.complication,
      extraParams: this.extraParams,
      currency: this.currency,
      signature: this._sig,
    };
  }

  constructor(
    protected _chainId: number,
    params: Types.OrderInput | Types.InternalOrder | Types.SignedOrder
  ) {
    try {
      const normalizedParams = normalize(params);
      this._params = this.getInternalOrder(normalizedParams);
      if (normalizedParams.signature) {
        this.sig = normalizedParams.signature;
      }
    } catch (err) {
      if (err instanceof Errors.InvalidOrderError) {
        throw new Error(`Invalid params: ${err.message}`);
      }
      throw new Error(`Invalid params: ${JSON.stringify(err)}`);
    }
  }

  protected get _isSingleToken() {
    return (
      this.numItems === 1 &&
      this.nfts.length === 1 &&
      this.nfts[0]?.tokens?.length === 1
    );
  }

  protected get _isContractWide() {
    return this.nfts.length === 1 && this.nfts[0]?.tokens?.length === 0;
  }

  protected _verifySig(encodedSignature: string) {
    if (!encodedSignature) {
      throw new Error("Order has not been signed");
    }

    const decodedSig = this._getDecodedSig(encodedSignature);
    const [types, value] = this._getEip712TypesAndValue();

    const signer = verifyTypedData(this._domain, types, value, decodedSig);

    if (lc(signer) !== this.signer) {
      throw new Error("Invalid signature");
    }
  }

  protected _getEip712TypesAndValue(): [
    Record<string, TypedDataField[]>,
    Types.InternalOrder,
    string
  ] {
    return [ORDER_EIP712_TYPES, this.getInternalOrder(this), "Order"];
  }

  public getSignedOrder() {
    this._verifySig(this.sig);
    return { ...this._params, sig: this.sig };
  }

  public getInternalOrder(params: Types.OrderInput): Types.InternalOrder {
    const d = {
      isSellOrder: params.isSellOrder,
      signer: params.signer,
      constraints: [
        s(params.numItems),
        params.startPrice,
        params.endPrice,
        s(params.startTime),
        s(params.endTime),
        params.nonce,
        params.maxGasPrice,
      ],
      nfts: params.nfts,
      execParams: [params.complication, params.currency],
      extraParams: params.extraParams,
    };

    return d;
  }

  protected _getEncodedSig(
    signature: Signature | { v: number; r: string; s: string }
  ): string {
    const encodedSig = defaultAbiCoder.encode(
      ["bytes32", "bytes32", "uint8"],
      [signature.r, signature.s, signature.v]
    );

    return encodedSig;
  }

  protected _getDecodedSig(encodedSig: string): SignatureLike {
    const [r, s, v] = defaultAbiCoder.decode(
      ["bytes32", "bytes32", "uint8"],
      encodedSig
    );

    return { r, s, v };
  }
}

export const normalizeNfts = (nfts: Types.OrderInput["nfts"]) => {
  type OrderNFTQuantities = {
    [collection: string]: { [tokenId: string]: number };
  };
  const nftsByCollection = nfts.reduce((acc: OrderNFTQuantities, nft) => {
    const collection = lc(nft.collection);
    const hasCollectionOrder =
      acc[collection] && Object.keys(acc[collection]).length === 0;
    const existingQuantities = acc[collection] || {};
    const hasTokenIdOrder = Object.keys(existingQuantities).length > 0;
    const isCollectionOrder = nft.tokens.length === 0;

    if (
      (hasCollectionOrder && !isCollectionOrder) ||
      (hasTokenIdOrder && isCollectionOrder)
    ) {
      throw new Errors.InvalidOrderError(Errors.InvalidOrderReason.MixingTypes);
    }

    for (const token of nft.tokens) {
      const tokenId = token.tokenId;
      if (existingQuantities[tokenId] != null) {
        throw new Errors.InvalidOrderError(
          Errors.InvalidOrderReason.DuplicateTokenId
        );
      }
      existingQuantities[tokenId] = token.numTokens;
    }

    acc[collection] = existingQuantities;
    return acc;
  }, {} as OrderNFTQuantities);

  const deduplicatedNfts: Types.OrderNFTs[] = Object.keys(nftsByCollection).map(
    (collection) => {
      const tokens = Object.keys(nftsByCollection[collection]).map(
        (tokenId) => {
          return {
            tokenId,
            numTokens: nftsByCollection[collection][tokenId],
          };
        }
      );
      return {
        collection,
        tokens,
      };
    }
  );

  return deduplicatedNfts;
};
export const normalize = (
  order: Types.OrderInput | Types.InternalOrder | Types.SignedOrder
): Types.OrderInput => {
  let input: Types.OrderInput;
  if ("constraints" in order) {
    const constraints = order.constraints.map((item) => bn(item).toString());
    input = {
      isSellOrder: order.isSellOrder,
      signer: order.signer,
      numItems: parseInt(constraints[0], 10),
      startPrice: constraints[1],
      endPrice: constraints[2],
      startTime: parseInt(constraints[3], 10),
      endTime: parseInt(constraints[4], 10),
      nonce: constraints[5],
      maxGasPrice: constraints[6],
      nfts: order.nfts,
      complication: order.execParams[0],
      currency: order.execParams[1],
      extraParams: order.extraParams,
    };
    if ("sig" in order) {
      input.signature = order.sig;
    }
  } else {
    input = order;
  }

  return {
    isSellOrder: input.isSellOrder,
    signer: lc(input.signer),
    numItems: input.numItems,
    startPrice: input.startPrice,
    endPrice: input.endPrice,
    startTime: input.startTime,
    endTime: input.endTime,
    nonce: input.nonce,
    maxGasPrice: input.maxGasPrice,
    nfts: normalizeNfts(input.nfts),
    complication: lc(input.complication),
    extraParams: input.extraParams,
    currency: lc(input.currency),
    signature: input.signature,
  };
};

const ORDER_EIP712_TYPES = {
  Order: [
    { name: "isSellOrder", type: "bool" },
    { name: "signer", type: "address" },
    { name: "constraints", type: "uint256[]" },
    { name: "nfts", type: "OrderItem[]" },
    { name: "execParams", type: "address[]" },
    { name: "extraParams", type: "bytes" },
  ],
  OrderItem: [
    { name: "collection", type: "address" },
    { name: "tokens", type: "TokenInfo[]" },
  ],
  TokenInfo: [
    { name: "tokenId", type: "uint256" },
    { name: "numTokens", type: "uint256" },
  ],
};
