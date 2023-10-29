import { Provider } from "@ethersproject/abstract-provider";
import { Contract } from "@ethersproject/contracts";

import * as Addresses from "./addresses";
import { Order } from "./order";
import { TxData } from "../utils";

import ExchangeAbi from "./abis/Exchange.json";

export class Exchange {
  public chainId: number;
  public contract: Contract;

  constructor(chainId: number) {
    this.chainId = chainId;
    this.contract = new Contract(Addresses.Exchange[chainId], ExchangeAbi);
  }

  public depositTx(user: string, solver: string, amount: string): TxData {
    return {
      from: user,
      to: Addresses.Exchange[this.chainId],
      data: this.contract.interface.encodeFunctionData("deposit", [solver]),
      value: amount,
    };
  }

  public executeRequestTx(request: Order): TxData {
    return {
      from: request.params.solver,
      to: Addresses.Exchange[this.chainId],
      data: this.contract.interface.encodeFunctionData("executeRequest", [
        request.params,
        request.params.signature!,
      ]),
    };
  }

  public async getRequestStatus(
    provider: Provider,
    requestHash: string
  ): Promise<{ isExecuted: boolean }> {
    const result = await this.contract.connect(provider).requestStatus(requestHash);
    return {
      isExecuted: result.isExecuted,
    };
  }

  public async getDepositedAmount(
    provider: Provider,
    user: string,
    solver: string
  ): Promise<string> {
    const amount = await this.contract.connect(provider).perSolverBalance(user, solver);
    return amount.toString();
  }
}
