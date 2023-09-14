export type TSTCollection = {
  kind: "collection";
  data: {
    collection: string;
  };
};

export type TSTCollectionNonFlagged = {
  kind: "collection-non-flagged";
  data: {
    collection: string;
  };
};

export type TSTAttribute = {
  kind: "attribute";
  data: {
    collection: string;
    attributes: [
      {
        key: string;
        value: string;
      }
    ];
  };
};

export type TSTTokenSet = {
  kind: "token-set";
  data: {
    tokenSetId: string;
  };
};

export type TokenSetSchema = TSTCollection | TSTCollectionNonFlagged | TSTAttribute | TSTTokenSet;

export type TokenSet = {
  id: string;
  schemaHash: string;
  schema: TokenSetSchema;
};
