/* eslint-disable @typescript-eslint/no-explicit-any */

import avatars from "./avatars.json";

export const extend = async (_chainId: number, metadata: any) => {
  const tokenId = metadata.tokenId;
  const relevantAvatar = (
    avatars as {
      [key: string]: any;
    }
  )[tokenId];

  const attributes = [];

  const avatarKeys = Object.keys(relevantAvatar);
  const avatarValues = Object.values(relevantAvatar);

  for (let i = 0; i < avatarKeys.length; i++) {
    attributes.push({
      key: avatarKeys[i],
      value: avatarValues[i],
      kind: "string",
    });
  }

  return {
    ...metadata,
    attributes,
  };
};
