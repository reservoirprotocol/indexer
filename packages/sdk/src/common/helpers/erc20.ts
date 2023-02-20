import {
  Provider,
  TransactionResponse,
} from "@ethersproject/abstract-provider";
import { Signer } from "@ethersproject/abstract-signer";
import { BigNumberish, BigNumber } from "@ethersproject/bignumber";
import { Contract } from "@ethersproject/contracts";

import { MaxUint256, TxData } from "../../utils";

import Erc20Abi from "../abis/Erc20.json";

export class Erc20 {
  public contract: Contract;

  constructor(provider: Provider, address: string) {
    this.contract = new Contract(address, Erc20Abi as any, provider);
  }

  public async transfer(
    from: Signer,
    to: string,
    amount: BigNumberish
  ): Promise<TransactionResponse> {
    return this.contract.connect(from).transfer(to, amount);
  }

  public transferTransaction(
    from: string,
    to: string,
    amount: BigNumberish
  ): TxData {
    const data = this.contract.interface.encodeFunctionData("transfer", [
      to,
      amount,
    ]);
    return {
      from,
      to: this.contract.address,
      data,
    };
  }

  public async approve(
    approver: Signer,
    spender: string,
    amount: BigNumberish = MaxUint256
  ): Promise<TransactionResponse> {
    return this.contract.connect(approver).approve(spender, amount);
  }

  public approveTransaction(
    approver: string,
    spender: string,
    amount: BigNumberish = MaxUint256
  ): TxData {
    const data = this.contract.interface.encodeFunctionData("approve", [
      spender,
      amount,
    ]);
    return {
      from: approver,
      to: this.contract.address,
      data,
    };
  }

  public async getBalance(owner: string): Promise<BigNumber> {
    return this.contract.balanceOf(owner);
  }

  public async getAllowance(
    owner: string,
    spender: string
  ): Promise<BigNumber> {
    return this.contract.allowance(owner, spender);
  }
}
