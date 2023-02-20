import { Order } from "../..";

export abstract class BaseBuilder<T> {
  constructor(public chainId: number) {}

  public abstract isValid(order: Order): boolean;
  public abstract build(params: T): Order;
}
