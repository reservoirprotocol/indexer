import { Interface } from "@ethersproject/abi";
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

export const createTransferTxsFromTransferItem = (transferItem: TransferItem, sender: string) => {
  const { recipient } = transferItem;

  return {
    txs: transferItem.items.map((item) => {
      let data: string;
      let value = "0";

      switch (item.itemType) {
        case ItemType.ERC20: {
          data = new Interface([
            "function transfer(address recipient, uint256 amount)",
          ]).encodeFunctionData("transfer", [recipient, item.amount]);

          break;
        }

        case ItemType.ERC1155: {
          data = new Interface([
            "function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes data)",
          ]).encodeFunctionData("safeTransferFrom", [
            sender,
            recipient,
            item.identifier,
            item.amount,
            "0x",
          ]);

          break;
        }

        case ItemType.ERC721: {
          data = new Interface([
            "function transferFrom(address from, address to, uint256 tokenId)",
          ]).encodeFunctionData("transferFrom", [sender, recipient, item.identifier]);

          break;
        }

        case ItemType.NATIVE: {
          data = "0x";
          value = item.amount.toString();

          break;
        }
      }

      return {
        approvals: [],
        txData: {
          from: sender,
          to: item.itemType === ItemType.NATIVE ? recipient : item.token,
          data,
          value,
        },
      };
    }),
  };
};
