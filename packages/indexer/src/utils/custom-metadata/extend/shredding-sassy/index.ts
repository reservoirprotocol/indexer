/* eslint-disable @typescript-eslint/no-explicit-any */

export const extend = async (_chainId: number, metadata: any) => {
  const traitCount = metadata.attributes.length;

  return {
    ...metadata,
    attributes: [
      ...metadata.attributes,
      {
        key: "Trait Count",
        value: traitCount,
        kind: "string",
      },
    ],
  };
};
