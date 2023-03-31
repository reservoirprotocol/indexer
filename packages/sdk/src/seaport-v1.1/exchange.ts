import { Contract } from "@ethersproject/contracts";
import { HashZero } from "@ethersproject/constants";
import * as Addresses from "./addresses";
import ExchangeAbi from "./abis/Exchange.json";
import { SeaportBaseExchange } from "../seaport-base/exchange";
import { IOrder } from "../seaport-base/order";

export class Exchange extends SeaportBaseExchange {
  constructor(chainId: number) {
    const contract = new Contract(Addresses.Exchange[chainId], ExchangeAbi);
    super(chainId, contract);
  }

  // --- Derive conduit from key ---

  public deriveConduit(conduitKey: string) {
    return conduitKey === HashZero
      ? Addresses.Exchange[this.chainId]
      : this.conduitController.deriveConduit(conduitKey);
  }

  // --- Get extra data ---

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  protected requiresExtraData(_order_: IOrder): boolean {
    return false;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public async getExtraData(_order: IOrder): Promise<string> {
    return "0x";
  }
}
