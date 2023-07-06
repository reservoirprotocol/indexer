import { Contract } from "@ethersproject/contracts";

import * as Addresses from "./addresses";

import ExchangeAbi from "./abis/BlurV2.json";

export class Exchange {
  public chainId: number;
  public contract: Contract;

  constructor(chainId: number) {
    this.chainId = chainId;
    this.contract = new Contract(Addresses.Exchange[this.chainId], ExchangeAbi);
  }
}
