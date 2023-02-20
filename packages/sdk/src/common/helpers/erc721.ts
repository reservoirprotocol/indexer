import {
  Provider,
  TransactionResponse,
} from "@ethersproject/abstract-provider";
import { Signer } from "@ethersproject/abstract-signer";
import { BigNumberish } from "@ethersproject/bignumber";
import { Contract } from "@ethersproject/contracts";

import { TxData } from "../../utils";

import Erc721Abi from "../abis/Erc721.json";

export class Erc721 {
  public contract: Contract;

  constructor(provider: Provider, address: string) {
    this.contract = new Contract(address, Erc721Abi as any, provider);
  }

  public async isValid(): Promise<boolean> {
    return this.contract.supportsInterface("0x80ac58cd");
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

  public async getOwner(tokenId: BigNumberish): Promise<string> {
    return this.contract.ownerOf(tokenId);
  }

  public async isApproved(owner: string, operator: string): Promise<boolean> {
    return this.contract.isApprovedForAll(owner, operator);
  }
}
