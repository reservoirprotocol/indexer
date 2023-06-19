import { Signer } from "@ethersproject/abstract-signer";
import { Contract, ContractTransaction } from "@ethersproject/contracts";

import * as Types from "./types";
import * as Addresses from "./addresses";
import { Order } from "./order";
import { TxData, generateSourceBytes } from "../utils";
import { Provider } from "@ethersproject/abstract-provider";
import ExchangeAbi from "./abis/Blend.json";
import { BigNumber } from "@ethersproject/bignumber";

// Blend:
// - escrowed orderbook

export class Exchange {
  public chainId: number;
  public contract: Contract;

  constructor(chainId: number) {
    this.chainId = chainId;
    this.contract = new Contract(Addresses.Blend[this.chainId], ExchangeAbi);
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

  public async fillOrder(
    taker: Signer,
    order: Order,
    lien: Types.Lien,
    options?: {
      source?: string;
    }
  ): Promise<ContractTransaction> {
    const tx = this.fillOrderTx(await taker.getAddress(), order, lien, options);
    return taker.sendTransaction(tx);
  }

  public fillOrderTx(
    taker: string,
    order: Order,
    lien: Types.Lien,
    options?: {
      source?: string;
    }
  ): TxData {
    const data = this.contract.interface.encodeFunctionData("buyLocked", [
      lien,
      order.params,
      order.params.signature!,
    ]);

    return {
      from: taker,
      to: this.contract.address,
      data: data + generateSourceBytes(options?.source),
    };
  }
}
