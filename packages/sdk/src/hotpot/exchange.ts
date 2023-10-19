import * as Addresses from "./addresses";
//import { Contract } from "@ethersproject/contracts";

export class Exchange {
  public exchangeAddress: string;
  //public contract: Contract;
  public chainId: number;

  constructor(chainId: number) {
    this.chainId = chainId;
    this.exchangeAddress = Addresses.Exchange[chainId];
    //this.contract = new Contract(this.exchangeAddress, ExchangeAbi);
  }

  public eip712Domain(): {
    name: string;
    version: string;
    chainId: number;
    verifyingContract: string;
  } {
    return {
      name: "Hotpot",
      version: "0.1.0",
      chainId: this.chainId,
      verifyingContract: this.exchangeAddress,
    };
  }
}
