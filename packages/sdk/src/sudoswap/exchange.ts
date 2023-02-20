import { Signer } from "@ethersproject/abstract-signer";
import { Contract, ContractTransaction } from "@ethersproject/contracts";

import * as Addresses from "./addresses";
import { TxData } from "../utils";

import PairFactoryAbi from "./abis/Factory.json";

export class Exchange {
  public chainId: number;
  public contract: Contract;

  constructor(chainId: number) {
    this.chainId = chainId;
    this.contract = new Contract(
      Addresses.PairFactory[this.chainId],
      PairFactoryAbi
    );
  }

  // --- Deposit NFTs ---

  public async depositNFTs(
    maker: Signer,
    nft: string,
    ids: number[],
    pool: string
  ): Promise<ContractTransaction> {
    const tx = this.depositNFTsTx(await maker.getAddress(), nft, ids, pool);
    return maker.sendTransaction(tx);
  }

  public depositNFTsTx(
    maker: string,
    nft: string,
    ids: number[],
    pool: string
  ): TxData {
    return {
      from: maker,
      to: this.contract.address,
      data: this.contract.interface.encodeFunctionData("depositNFTs", [
        nft,
        ids,
        pool,
      ]),
    };
  }
}
