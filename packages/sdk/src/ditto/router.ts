import { Signer } from "@ethersproject/abstract-signer";
import { Contract, ContractTransaction } from "@ethersproject/contracts";

import * as Addresses from "./addresses";
import { Order } from "./order";
import { NftInSwapStruct, SwapStruct } from "./types";
import { TxData, bn } from "../utils";

import RouterAbi from "./abis/DittoRouterRoyalties.json";

const tenMinutesFromNow = () => bn(Math.floor(Date.now() / 1000) + 10 * 60);

export class Router {
  public chainId: number;
  public contract: Contract;

  constructor(chainId: number) {
    this.chainId = chainId;
    this.contract = new Contract(Addresses.DittoPoolRouterRoyalties[this.chainId], RouterAbi);
  }

  // --- TRADING ERC20 TOKENS FOR NFTs

  public async fillBuyOrder(taker: Signer, order: Order): Promise<ContractTransaction> {
    const tx = this.fillBuyOrderTx(await taker.getAddress(), order);
    return taker.sendTransaction(tx);
  }

  public fillBuyOrderTx(
    taker: string,
    order: Order,
    options?: {
      recipient?: string;
    }
  ): TxData {
    const swap: SwapStruct = {
      pool: order.params.pool,
      nftIds: order.params.nftIds.map((id) => bn(id)),
      swapData: order.params.swapData,
    };
    const swapTokensForNftsParams = [
      [swap],
      order.params.expectedTokenAmount,
      options?.recipient ?? order.params.recipient ?? taker,
      tenMinutesFromNow(),
    ];
    const functionFragment = this.contract.interface.getFunction("swapTokensForNfts");
    return {
      from: taker,
      to: this.contract.address,
      data: this.contract.interface.encodeFunctionData(functionFragment, swapTokensForNftsParams),
    };
  }

  public async fillSellOrder(taker: Signer, order: Order): Promise<ContractTransaction> {
    const tx = this.fillSellOrderTx(await taker.getAddress(), order);
    return taker.sendTransaction(tx);
  }

  // --- TRADING NFTs FOR ERC20 TOKENS

  public fillSellOrderTx(
    taker: string,
    order: Order,
    options?: {
      recipient?: string;
    }
  ): TxData {
    const swap: NftInSwapStruct = {
      pool: order.params.pool,
      nftIds: order.params.nftIds.map((id) => bn(id)),
      lpIds: order.params.lpIds!.map((id) => bn(id)),
      permitterData: order.params.permitterData!,
      swapData: order.params.swapData,
    };
    const swapNftsForTokensParams = [
      [swap],
      order.params.expectedTokenAmount,
      options?.recipient ?? order.params.recipient ?? taker,
      tenMinutesFromNow(),
    ];
    return {
      from: taker,
      to: this.contract.address,
      data: this.contract.interface.encodeFunctionData(
        "swapNftsForTokens",
        swapNftsForTokensParams
      ),
    };
  }
}
