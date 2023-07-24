import { Provider, TransactionResponse } from "@ethersproject/abstract-provider";
import { Signer } from "@ethersproject/abstract-signer";
import { BigNumberish } from "@ethersproject/bignumber";

import { Erc20 } from "./erc20";
import * as Addresses from "../addresses";
import { TxData, bn } from "../../utils";

export class WNative extends Erc20 {
  constructor(provider: Provider, chainId: number) {
    super(provider, Addresses.WNative[chainId]);
  }

  public async deposit(depositor: Signer, amount: BigNumberish): Promise<TransactionResponse> {
    return this.contract.connect(depositor).deposit({ value: amount });
  }

  public depositTransaction(depositor: string, amount: BigNumberish): TxData {
    const data = this.contract.interface.encodeFunctionData("deposit");
    return {
      from: depositor,
      to: this.contract.address,
      data,
      value: bn(amount).toHexString(),
    };
  }
}
