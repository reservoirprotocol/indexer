import { Exchange } from "./exchange";
import * as Types from "../seaport-base/types";
import { Order as OrderV15 } from "../seaport-v1.5/order";
import { TypedDataSigner } from "@ethersproject/abstract-signer";
import { cosignOrder } from "../seaport-base/helpers";
import * as Addresses from "../seaport-base/addresses";

export class Order extends OrderV15 {
  constructor(chainId: number, params: Types.OrderComponents) {
    super(chainId, params);
  }

  // Overrides

  public exchange() {
    return new Exchange(this.chainId);
  }

  public async cosign(signer: TypedDataSigner, taker: string, matchParams: Types.MatchParams) {
    const { extraDataComponent } = await cosignOrder(
      this,
      signer,
      taker,
      matchParams,
      Addresses.ReservoirV16CancellationZone[this.chainId]
    );
    this.params.extraData = extraDataComponent.toString();
  }
}
