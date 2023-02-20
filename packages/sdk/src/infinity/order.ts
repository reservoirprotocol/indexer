import * as Types from "./types";
import { Provider } from "@ethersproject/abstract-provider";
import { bn, getCurrentTimestamp, lc } from "../utils";
import { TypedDataSigner } from "@ethersproject/abstract-signer";
import {
  keccak256,
  solidityKeccak256,
  defaultAbiCoder,
  splitSignature,
  _TypedDataEncoder,
} from "ethers/lib/utils";
import { BigNumber, BigNumberish, Contract } from "ethers";
import { OrderParams } from "./order-params";
import * as CommonAddresses from "../common/addresses";
import { Addresses } from ".";
import ExchangeAbi from "./abis/Exchange.json";
import ComplicationAbi from "./abis/Complication.json";

import { Builders } from ".";
import { Common } from "..";

export class Order extends OrderParams {
  constructor(
    chainId: number,
    params: Types.OrderInput | Types.InternalOrder | Types.SignedOrder
  ) {
    super(chainId, params);
    this.checkBaseValid();
  }

  public async sign(signer: TypedDataSigner) {
    const [types, value] = this._getEip712TypesAndValue();
    const sig = splitSignature(
      await signer._signTypedData(this._domain, types, value)
    );
    this.sig = sig;
  }

  public hash() {
    return orderHash(this.getInternalOrder(this));
  }

  public getSignatureData() {
    const [types, value] = this._getEip712TypesAndValue();
    return {
      signatureKind: "eip712",
      domain: this._domain,
      types,
      value,
    };
  }

  public checkValidity() {
    if (!this.getBuilder().isValid(this)) {
      throw new Error("Invalid order");
    }
  }

  public checkBaseValid() {
    if (
      !this.isSellOrder &&
      this.currency === CommonAddresses.Eth[this.chainId]
    ) {
      throw new Error("Offers cannot be made in ETH");
    }

    if (this.isSellOrder) {
      for (const nft of this.nfts) {
        if (!nft.tokens || nft.tokens.length === 0) {
          throw new Error("Listings must specify token ids");
        }
      }
    }

    const complicationValid =
      this.complication === Addresses.Complication[this.chainId];

    if (!complicationValid) {
      throw new Error("Invalid complication address");
    }
  }

  public async checkFillability(provider: Provider) {
    const chainId = (await provider.getNetwork()).chainId;

    const exchange = new Contract(
      Addresses.Exchange[chainId],
      ExchangeAbi,
      provider
    );

    const complication = new Contract(
      Addresses.Complication[chainId],
      ComplicationAbi,
      provider
    );

    const isNonceValid = await exchange.isNonceValid(this.signer, this.nonce);
    if (!isNonceValid) {
      throw new Error("not-fillable");
    }

    if (this.currency !== CommonAddresses.Eth[chainId]) {
      const isCurrencyValid = await complication.isValidCurrency(this.currency);
      if (!isCurrencyValid) {
        throw new Error("not-fillable");
      }
    }

    if (this.isSellOrder) {
      const { balance } = await this.getFillableTokens(provider);
      /**
       * the maker of the order only needs to have enough tokens
       * to fill the order
       */
      if (balance < this.numItems) {
        throw new Error("no-balance");
      }
    } else {
      // the order is an offer
      const erc20 = new Common.Helpers.Erc20(provider, this.currency);
      const balance = await erc20.getBalance(this.signer);
      const currentPrice = this.getPrice(Date.now());
      if (bn(balance).lt(currentPrice)) {
        throw new Error("no-balance");
      }

      const allowance = await erc20.getAllowance(
        this.signer,
        Addresses.Exchange[chainId]
      );
      if (bn(allowance).lt(currentPrice)) {
        throw new Error("no-approval");
      }
    }
  }

  public async getFillableTokens(provider: Provider) {
    type NftsWithOwnershipData = {
      collection: string;
      isApproved: boolean;
      tokens: { tokenId: string; numTokens: number; isOwner: boolean }[];
    };
    const nfts: NftsWithOwnershipData[] = [];
    const ownedAndApprovedNfts: NftsWithOwnershipData[] = [];

    for (const { collection, tokens } of this.nfts) {
      const erc721 = new Common.Helpers.Erc721(provider, collection);
      const isApproved = await erc721.isApproved(
        this.signer,
        Addresses.Exchange[this.chainId]
      );
      const collectionNfts: NftsWithOwnershipData = {
        collection,
        isApproved,
        tokens: [],
      };

      for (const { tokenId, numTokens } of tokens) {
        const owner = await erc721.getOwner(tokenId);
        const isOwner = lc(owner) === this.signer;
        collectionNfts.tokens.push({
          isOwner,
          tokenId,
          numTokens,
        });
      }

      nfts.push(collectionNfts);

      if (isApproved) {
        const ownedTokens = collectionNfts.tokens.filter(
          (item) => item.isOwner
        );
        if (ownedTokens.length > 0) {
          ownedAndApprovedNfts.push({
            collection,
            isApproved,
            tokens: ownedTokens,
          });
        }
      }
    }

    const balance = ownedAndApprovedNfts.reduce((acc, { tokens }) => {
      return acc + tokens.reduce((acc, { numTokens }) => acc + numTokens, 0);
    }, 0);

    return {
      balance,
      tokens: nfts,
      fillableTokens: ownedAndApprovedNfts,
    };
  }

  public getMatchingPrice(timestampOverride?: number): BigNumberish {
    const startPrice = bn(this.startPrice);
    const endPrice = bn(this.endPrice);

    if (startPrice.gt(endPrice)) {
      // price is decreasing
      return this.getPrice(timestampOverride ?? getCurrentTimestamp(-60));
    } else if (endPrice.gt(startPrice)) {
      // price is increasing
      return this.getPrice(timestampOverride ?? getCurrentTimestamp(120));
    }
    // price is constant
    return this.getPrice(timestampOverride ?? getCurrentTimestamp());
  }

  protected getBuilder() {
    switch (this.kind) {
      case "single-token":
        return new Builders.SingleToken(this.chainId);
      case "contract-wide":
        return new Builders.ContractWide(this.chainId);
      case "complex":
        return new Builders.Complex(this.chainId);
      default:
        throw new Error("Unknown order kind");
    }
  }

  protected getPrice(timestamp: number, precision = 4): BigNumberish {
    const startTime = bn(this.startTime);
    const endTime = bn(this.endTime);
    const startPrice = bn(this.startPrice);
    const endPrice = bn(this.endPrice);
    const duration = endTime.sub(startTime);
    let priceDiff: BigNumber;
    if (startPrice.gt(endPrice)) {
      priceDiff = startPrice.sub(endPrice);
    } else {
      priceDiff = endPrice.sub(startPrice);
    }

    if (priceDiff.eq(0) || duration.eq(0)) {
      return startPrice;
    }

    const elapsedTime = bn(timestamp).sub(startTime);
    const precisionMultiplier = bn(10).pow(precision);
    const portion = elapsedTime.gt(duration)
      ? precisionMultiplier
      : elapsedTime.mul(precisionMultiplier).div(duration);
    priceDiff = priceDiff.mul(portion).div(precisionMultiplier);
    const isPriceDecreasing = startPrice.gt(endPrice);

    const priceAtTime = isPriceDecreasing
      ? startPrice.sub(priceDiff)
      : startPrice.add(priceDiff);
    return priceAtTime;
  }
}

export function orderHash(order: Types.InternalOrder): string {
  const fnSign =
    "Order(bool isSellOrder,address signer,uint256[] constraints,OrderItem[] nfts,address[] execParams,bytes extraParams)OrderItem(address collection,TokenInfo[] tokens)TokenInfo(uint256 tokenId,uint256 numTokens)";
  const orderTypeHash = solidityKeccak256(["string"], [fnSign]);

  const constraints = order.constraints;
  const execParams = order.execParams;
  const extraParams = order.extraParams;

  const constraintsHash = keccak256(
    defaultAbiCoder.encode(
      [
        "uint256",
        "uint256",
        "uint256",
        "uint256",
        "uint256",
        "uint256",
        "uint256",
      ],
      constraints
    )
  );

  const orderItemsHash = nftsHash(order.nfts);
  const execParamsHash = keccak256(
    defaultAbiCoder.encode(["address", "address"], execParams)
  );

  const calcEncode = defaultAbiCoder.encode(
    ["bytes32", "bool", "address", "bytes32", "bytes32", "bytes32", "bytes32"],
    [
      orderTypeHash,
      order.isSellOrder,
      order.signer,
      constraintsHash,
      orderItemsHash,
      execParamsHash,
      keccak256(extraParams),
    ]
  );

  return keccak256(calcEncode);
}

export function nftsHash(nfts: Types.OrderNFTs[]): string {
  const fnSign =
    "OrderItem(address collection,TokenInfo[] tokens)TokenInfo(uint256 tokenId,uint256 numTokens)";
  const typeHash = solidityKeccak256(["string"], [fnSign]);

  const hashes = [];
  for (const nft of nfts) {
    const hash = keccak256(
      defaultAbiCoder.encode(
        ["bytes32", "uint256", "bytes32"],
        [typeHash, nft.collection, tokensHash(nft.tokens)]
      )
    );
    hashes.push(hash);
  }
  const encodeTypeArray = hashes.map(() => "bytes32");
  const nftsHash = keccak256(defaultAbiCoder.encode(encodeTypeArray, hashes));

  return nftsHash;
}

export function tokensHash(tokens: Types.OrderNFTs["tokens"]): string {
  const fnSign = "TokenInfo(uint256 tokenId,uint256 numTokens)";
  const typeHash = solidityKeccak256(["string"], [fnSign]);

  const hashes = [];
  for (const token of tokens) {
    const hash = keccak256(
      defaultAbiCoder.encode(
        ["bytes32", "uint256", "uint256"],
        [typeHash, token.tokenId, token.numTokens]
      )
    );
    hashes.push(hash);
  }
  const encodeTypeArray = hashes.map(() => "bytes32");
  const tokensHash = keccak256(defaultAbiCoder.encode(encodeTypeArray, hashes));
  return tokensHash;
}
