import { Contract } from "@ethersproject/contracts";

import * as Addresses from "./addresses";
import { TxData } from "../utils";

import EscrowAbi from "./abis/Escrow.json";

export class Escrow {
  public chainId: number;
  public contract: Contract;

  constructor(chainId: number) {
    this.chainId = chainId;
    this.contract = new Contract(Addresses.Escrow[chainId], EscrowAbi);
  }

  public depositNativeTx(user: string, amount: string): TxData {
    return {
      from: user,
      to: this.contract.address.toLowerCase(),
      data: this.contract.interface.encodeFunctionData("depositNative", [user]),
      value: amount,
    };
  }
}
