import { Provider } from "@ethersproject/abstract-provider";
import { Signer } from "@ethersproject/abstract-signer";
import { BigNumber } from "@ethersproject/bignumber";
import { Contract, ContractTransaction } from "@ethersproject/contracts";

import * as Addresses from "./addresses";
import { Order } from "./order";
import { TxData } from "../utils";

import ExchangeAbi from "./abis/Exchange.json";

export class Exchange {
  public chainId: number;
  public contract: Contract;

  constructor(chainId: number) {
    this.chainId = chainId;
    this.contract = new Contract(Addresses.Exchange[this.chainId], ExchangeAbi);
  }

  // --- Cancel order ---

  public async cancelOrder(maker: Signer, order: Order): Promise<ContractTransaction> {
    const tx = this.cancelOrderTx(await maker.getAddress(), order);
    return maker.sendTransaction(tx);
  }

  public cancelOrderTx(maker: string, order: Order): TxData {
    const data: string = this.contract.interface.encodeFunctionData("cancelOrder", [order.params]);
    return {
      from: maker,
      to: this.contract.address,
      data,
    };
  }

  // --- Get nonce ---

  public async getNonce(provider: Provider, user: string): Promise<BigNumber> {
    return this.contract.connect(provider).nonces(user);
  }

  // --- Increase nonce ---

  public async incrementHashNonce(maker: Signer): Promise<ContractTransaction> {
    const tx = this.incrementHashNonceTx(await maker.getAddress());
    return maker.sendTransaction(tx);
  }

  public incrementHashNonceTx(maker: string): TxData {
    const data: string = this.contract.interface.encodeFunctionData("incrementNonce", []);
    return {
      from: maker,
      to: this.contract.address,
      data,
    };
  }
}
