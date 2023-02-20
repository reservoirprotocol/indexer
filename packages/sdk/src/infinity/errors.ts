export enum InvalidOrderReason {
  MixingTypes = "Collection and token id orders cannot be mixed for the same collection",
  DuplicateTokenId = "Duplicate token id in order",
}

export class InvalidOrderError extends Error {
  constructor(message: string) {
    super(message);
  }
}
