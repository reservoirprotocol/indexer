/* eslint-disable @typescript-eslint/no-explicit-any */

export const extend = async (_chainId: number, metadata: any) => {
  return {
    ...metadata,
    attributes: [
      {
        key: "Name",
        value: metadata.name,
        kind: "string",
        rank: 1,
      },
    ],
  };
};
