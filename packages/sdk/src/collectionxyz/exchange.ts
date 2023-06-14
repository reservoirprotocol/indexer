import { Signer } from "@ethersproject/abstract-signer";
import { Contract, ContractTransaction } from "@ethersproject/contracts";

import * as Addresses from "./addresses";
import { TxData } from "../utils";

import CollectionPoolFactoryAbi from "./abis/CollectionPoolFactory.json";
import { BigNumberish } from "ethers";

export class Exchange {
  public chainId: number;
  public contract: Contract;

  constructor(chainId: number) {
    this.chainId = chainId;
    this.contract = new Contract(
      Addresses.CollectionPoolFactory[this.chainId],
      CollectionPoolFactoryAbi
    );
  }

  // --- Deposit NFTs ---

  public async depositNFTs(
    maker: Signer,
    ids: number[],
    proof: string[],
    proofFlags: boolean[],
    poolAddress: string,
    sender: string
  ): Promise<ContractTransaction> {
    const tx = this.depositNFTsTx(
      await maker.getAddress(),
      ids,
      proof,
      proofFlags,
      poolAddress,
      sender
    );
    return maker.sendTransaction(tx);
  }

  public depositNFTsTx(
    maker: string,
    ids: number[],
    proof: string[],
    proofFlags: boolean[],
    poolAddress: string,
    sender: string
  ): TxData {
    return {
      from: maker,
      to: this.contract.address,
      data: this.contract.interface.encodeFunctionData("depositNFTs", [
        ids,
        proof,
        proofFlags,
        poolAddress,
        sender,
      ]),
    };
  }

  public async depositERC20(
    maker: Signer,
    erc20: string,
    amount: BigNumberish,
    poolAddress: string,
    sender: string
  ): Promise<ContractTransaction> {
    const tx = this.depositERC20Tx(await maker.getAddress(), erc20, amount, poolAddress, sender);
    return maker.sendTransaction(tx);
  }

  public depositERC20Tx(
    maker: string,
    erc20: string,
    amount: BigNumberish,
    poolAddress: string,
    sender: string
  ): TxData {
    return {
      from: maker,
      to: this.contract.address,
      data: this.contract.interface.encodeFunctionData("depositERC20", [
        erc20,
        amount,
        poolAddress,
        sender,
      ]),
    };
  }
}
