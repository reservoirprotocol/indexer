import { Signer } from "@ethersproject/abstract-signer";
import { Contract, ContractTransaction } from "@ethersproject/contracts";

import * as Addresses from "./addresses";
import { Order } from "./order";
import { TxData, generateSourceBytes } from "../utils";

import RouterAbi from "./abis/Router.json";

// Sudoswap:
// - fully on-chain
// - pooled liquidity

export class Router {
  public chainId: number;
  public contract: Contract;

  constructor(chainId: number) {
    this.chainId = chainId;
    this.contract = new Contract(
      Addresses.RouterWithRoyalties[this.chainId],
      RouterAbi
    );
  }

  // --- Fill buy order ---

  public async fillBuyOrder(
    taker: Signer,
    order: Order,
    tokenId: string,
    options?: {
      recipient?: string;
      source?: string;
    }
  ): Promise<ContractTransaction> {
    const tx = this.fillBuyOrderTx(
      await taker.getAddress(),
      order,
      tokenId,
      options
    );
    return taker.sendTransaction(tx);
  }

  public fillBuyOrderTx(
    taker: string,
    order: Order,
    tokenId: string,
    options?: {
      recipient?: string;
      source?: string;
    }
  ): TxData {
    return {
      from: taker,
      to: this.contract.address,
      data:
        this.contract.interface.encodeFunctionData("swapNFTsForToken", [
          [
            {
              pair: order.params.pair,
              nftIds: [tokenId],
            },
          ],
          order.params.extra.prices[0] ?? 0,
          options?.recipient ?? taker,
          Math.floor(Date.now() / 1000) + 10 * 60,
        ]) + generateSourceBytes(options?.source),
    };
  }
}
