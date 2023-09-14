export class BlockedRouteError extends Error {
  constructor(message: string) {
    super(message);

    Object.setPrototypeOf(this, BlockedRouteError.prototype);
  }
}
