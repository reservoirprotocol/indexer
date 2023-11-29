import { Provider } from "@ethersproject/abstract-provider";
import { Contract } from "@ethersproject/contracts";

import * as Addresses from "./addresses";
import { Order } from "./order";
import * as CommonAddresses from "../../../common/addresses";
import { TxData } from "../../../utils";

import ModuleAbi from "./abis/Module.json";

export class Module {
  public chainId: number;
  public contract: Contract;

  constructor(chainId: number) {
    this.chainId = chainId;
    this.contract = new Contract(Addresses.Module[chainId], ModuleAbi);
  }

  public prevalidateAndDepositTx(request: Order, amount: string): TxData {
    return {
      from: request.params.maker,
      to: Addresses.Module[this.chainId],
      data: this.contract.interface.encodeFunctionData("prevalidateAndDeposit", [
        request.params,
        amount,
      ]),
      value: request.params.currency === CommonAddresses.Native[this.chainId] ? amount : undefined,
    };
  }

  public executeTx(request: Order): TxData {
    return {
      from: request.params.solver,
      to: Addresses.Module[this.chainId],
      data: this.contract.interface.encodeFunctionData("execute", [
        request.params,
        request.params.signature ?? "0x",
      ]),
    };
  }

  public async getRequestState(
    provider: Provider,
    requestHash: string
  ): Promise<{ isExecuted: boolean; isPrevalidated: boolean }> {
    const result = await this.contract.connect(provider).requestStatus(requestHash);
    return {
      isExecuted: result.isExecuted,
      isPrevalidated: result.isPrevalidated,
    };
  }
}
