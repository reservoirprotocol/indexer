import { BigNumberish } from "@ethersproject/bignumber";

export enum ItemType {
  NATIVE,
  ERC20,
  ERC721,
  ERC1155,
}

export type TransferItem = {
  items: {
    itemType: ItemType;
    token: string;
    identifier: BigNumberish;
    amount: BigNumberish;
  }[];
  recipient: string;
};
