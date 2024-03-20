import * as Addresses from "./addresses";
import { Exchange as ExchangeV15 } from "../seaport-v1.5/exchange";

export class Exchange extends ExchangeV15 {
  constructor(chainId: number) {
    super(chainId, Addresses.Exchange[chainId]);
  }

  // Overrides

  public eip712Domain(): {
    name: string;
    version: string;
    chainId: number;
    verifyingContract: string;
  } {
    return {
      name: "Seaport",
      version: "1.6",
      chainId: this.chainId,
      verifyingContract: this.exchangeAddress,
    };
  }
}
