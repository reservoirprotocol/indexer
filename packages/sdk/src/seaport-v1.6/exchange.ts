import * as Addresses from "./addresses";
import { Addresses as BaseAddresses, IOrder, Types } from "../seaport-base";
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

  public requiresExtraData(order: IOrder): boolean {
    if (order.params.extraData) {
      return true;
    }

    if (order.params.zone === BaseAddresses.ReservoirV16CancellationZone[this.chainId]) {
      return true;
    }

    return false;
  }

  public async getExtraData(order: IOrder, matchParams?: Types.MatchParams): Promise<string> {
    if (
      order.params.extraData ||
      order.params.zone === BaseAddresses.ReservoirV16CancellationZone[this.chainId]
    ) {
      return order.params.extraData ?? "0x";
    }

    return matchParams?.extraData ?? "0x";
  }
}
