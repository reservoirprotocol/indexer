export class TokenSets {
  public static getContractFromTokenSetId(tokenSetId: string) {
    let contract;
    let collectionId;

    if (tokenSetId.startsWith("token:")) {
      [, contract] = tokenSetId.split(":");
    } else if (tokenSetId.startsWith("list:")) {
      // If the list consists multiple contracts
      if (tokenSetId.split(":").length === 3) {
        [, contract] = tokenSetId.split(":");
      }
    } else if (tokenSetId.startsWith("range:")) {
      [, contract] = tokenSetId.split(":");
    } else if (tokenSetId.startsWith("dynamic:")) {
      [, , collectionId] = tokenSetId.split(":");
    } else {
      [, collectionId] = tokenSetId.split(":");
    }

    if (!contract && collectionId) {
      [contract] = collectionId.split(":");
    }

    return contract;
  }
}
