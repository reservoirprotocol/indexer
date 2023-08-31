/* eslint-disable @typescript-eslint/no-explicit-any */

export const extend = async (_chainId: number, metadata: any) => {
  return {
    ...metadata,
    attributes: [
      ...metadata.attributes,
      {
        key: "Trait Count",
        value: metadata.attributes.length,
        kind: "string",
        rank: 2,
      },
    ],
  };
};
