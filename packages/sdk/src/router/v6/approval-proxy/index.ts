import { BigNumberish } from "@ethersproject/bignumber";

export enum ItemType {
  NATIVE,
  ERC20,
  ERC721,
  ERC1155,
}

export type Item = {
  itemType: ItemType;
  token: string;
  identifier: BigNumberish;
  amount: BigNumberish;
};

export type TransferItem = {
  items: Item[];
  recipient: string;
};
