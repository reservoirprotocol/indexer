export class BlockedRouteError extends Error {
  constructor(message: string) {
    super(message);

    Object.setPrototypeOf(this, BlockedRouteError.prototype);
  }
}
export class BlockedKeyError extends Error {
  constructor(message: string) {
    super(message);

    Object.setPrototypeOf(this, BlockedKeyError.prototype);
  }
}
