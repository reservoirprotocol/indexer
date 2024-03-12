import { Contract } from "@ethersproject/contracts";

import * as Addresses from "./addresses";
import ExchangeAbi from "../payment-processor-base/abis/Exchange.json";
import { PaymentProcessorBaseExchange } from "../payment-processor-base";

export class Exchange extends PaymentProcessorBaseExchange {
  public contract: Contract;
  public domainSeparator: string;

  constructor(chainId: number) {
    super(chainId);
    this.contract = new Contract(Addresses.Exchange[this.chainId], ExchangeAbi);
    this.domainSeparator = this.buildDomainSeparator();
  }
}
