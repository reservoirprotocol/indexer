/* eslint-disable @typescript-eslint/no-explicit-any */

export const extend = async (_chainId: number, metadata: any) => {
  metadata.attributes.forEach((attribute: any) => {
    attribute.key = attribute.key.charAt(0).toUpperCase() + attribute.key.slice(1);
    attribute.kind = "string";
  });

  return metadata;
};
