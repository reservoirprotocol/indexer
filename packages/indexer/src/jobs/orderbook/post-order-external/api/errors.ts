export class RequestWasThrottledError extends Error {
  delay = 0;

  constructor(message: string, delay: number) {
    super(message);
    this.delay = delay;

    Object.setPrototypeOf(this, RequestWasThrottledError.prototype);
  }
}

export class InvalidRequestError extends Error {
  constructor(message: string) {
    super(message);

    Object.setPrototypeOf(this, InvalidRequestError.prototype);
  }
}
