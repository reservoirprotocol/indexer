import { Exchange as SeaportV14Exchange } from "../seaport-v1.4/exchange";
import { Contract } from "@ethersproject/contracts";
import * as Addresses from "./addresses";
import { CancellationZone } from "../seaport-v1.4/addresses";
import ExchangeAbi from "./abis/Exchange.json";

export class Exchange extends SeaportV14Exchange {
  protected exchangeAddress: string;
  protected cancellationZoneAddress: string;
  public contract: Contract;

  constructor(chainId: number) {
    super(chainId);
    this.exchangeAddress = Addresses.Exchange[chainId];
    this.cancellationZoneAddress = CancellationZone[chainId];
    this.contract = new Contract(this.exchangeAddress, ExchangeAbi);
  }

  public eip712Domain(): {
    name: string;
    version: string;
    chainId: number;
    verifyingContract: string;
  } {
    return {
      name: "Alienswap",
      version: "1.4",
      chainId: this.chainId,
      verifyingContract: this.exchangeAddress,
    };
  }
}
