import { BigNumberish } from "@ethersproject/bignumber";
import { AddressZero, HashZero } from "@ethersproject/constants";

import { Order } from "../../order";
import * as Types from "../../types";
import { bn } from "../../../utils";

export interface BuildParams {
  maker: string;
  paymentToken: string;
  price: BigNumberish;
  contract: string;
  tokenId: BigNumberish;
  listingTime: number;
  expirationTime: number;
  startNonce: number;
  hashNonce: BigNumberish;
  platformFeeRecipient?: string;
  platformFee?: number;
  royaltyFeeRecipient?: string;
  royaltyFee?: number;
}

export class BatchSignedTokenBuilder {
  public chainId: number;

  constructor(chainId: number) {
    this.chainId = chainId;
  }

  public build(params: BuildParams) {
    const collection: Types.Collection = {
      nftAddress: params.contract,
      platformFee: params.platformFee || 0,
      royaltyFee: params.royaltyFee || 0,
      royaltyFeeRecipient: params.royaltyFeeRecipient || AddressZero,
      items: [
        {
          erc20TokenAmount: bn(params.price).toString(),
          nftId: params.tokenId.toString(),
        },
      ],
    };

    const basicCollections: Types.Collection[] = [];
    const collections: Types.Collection[] = [];
    if (
      bn(params.tokenId).gte(bn(1).shl(160)) ||
      bn(params.price).gte(bn(1).shl(96))
    ) {
      collections.push(collection);
    } else {
      basicCollections.push(collection);
    }

    return new Order(this.chainId, {
      maker: params.maker,
      listingTime: params.listingTime,
      expirationTime: params.expirationTime,
      startNonce: params.startNonce,
      erc20Token: params.paymentToken,
      platformFeeRecipient: params.platformFeeRecipient || AddressZero,
      basicCollections: basicCollections,
      collections: collections,
      hashNonce: params.hashNonce.toString(),
      hash: HashZero,
      nonce: params.startNonce,
      v: 0,
      r: HashZero,
      s: HashZero,
    });
  }
}
