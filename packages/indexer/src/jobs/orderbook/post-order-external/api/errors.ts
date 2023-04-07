export class RequestWasThrottledError extends Error {
  delay = 0;

  constructor(message: string, delay: number) {
    super(message);
    this.delay = delay;

    Object.setPrototypeOf(this, RequestWasThrottledError.prototype);
  }
}

export enum InvalidRequestErrorKind {
  InvalidFees = "invalid-fees",
}

export class InvalidRequestError extends Error {
  kind: InvalidRequestErrorKind | undefined;
  constructor(message: string, kind?: InvalidRequestErrorKind) {
    super(message);
    this.kind = kind;

    Object.setPrototypeOf(this, InvalidRequestError.prototype);
  }
}
