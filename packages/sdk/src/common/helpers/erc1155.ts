import {
  Provider,
  TransactionResponse,
} from "@ethersproject/abstract-provider";
import { Signer } from "@ethersproject/abstract-signer";
import { BigNumberish, BigNumber } from "@ethersproject/bignumber";
import { Contract } from "@ethersproject/contracts";

import { TxData } from "../../utils";

import Erc1155Abi from "../abis/Erc1155.json";

export class Erc1155 {
  public contract: Contract;

  constructor(provider: Provider, address: string) {
    this.contract = new Contract(address, Erc1155Abi as any, provider);
  }

  public async isValid(): Promise<boolean> {
    return this.contract.supportsInterface("0xd9b67a26");
  }

  public async approve(
    approver: Signer,
    operator: string
  ): Promise<TransactionResponse> {
    return this.contract.connect(approver).setApprovalForAll(operator, true);
  }

  public approveTransaction(approver: string, operator: string): TxData {
    const data = this.contract.interface.encodeFunctionData(
      "setApprovalForAll",
      [operator, true]
    );
    return {
      from: approver,
      to: this.contract.address,
      data,
    };
  }

  public async getBalance(
    owner: string,
    tokenId: BigNumberish
  ): Promise<BigNumber> {
    return this.contract.balanceOf(owner, tokenId);
  }

  public async isApproved(owner: string, operator: string): Promise<boolean> {
    return this.contract.isApprovedForAll(owner, operator);
  }
}
