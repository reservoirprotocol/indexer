import { BigNumberish, BytesLike } from "ethers";

export type OrderParams = {
  pool: string;
  nftIds: BigNumberish[];
  lpIds?: BigNumberish[];
  expectedTokenAmount: BigNumberish; // buy = erc20 inputAmount, sell = minOutput erc20 amount
  recipient?: string; // buy = nftRecipient, sell = erc20 tokenRecipient
  swapData: BytesLike; // defaults to 0x0 (of type bytes)
  permitterData?: BytesLike; // only required for selling
};

export type SwapStruct = {
  pool: string;
  nftIds: BigNumberish[];
  swapData: BytesLike;
};

export type NftInSwapStruct = {
  pool: string;
  nftIds: BigNumberish[];
  lpIds: BigNumberish[];
  permitterData: BytesLike;
  swapData: BytesLike;
};
