/* eslint-disable @typescript-eslint/no-explicit-any */

export const extend = async (_chainId: number, metadata: any) => {
  let name = metadata.name;
  if (metadata.tokenId == 0) {
    name = "Phase 1";
  } else {
    name = "Phase 2";
  }

  return {
    ...metadata,
    name,
  };
};
