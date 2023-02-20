import { ComplicationV1 } from "./complication-v1";
import { ComplicationV2 } from "./complication-v2";
import { Complication } from "./complication.interface";

const Default = ComplicationV2;

export function getComplication(
  chainId: number,
  address?: string
): Complication {
  if (address) {
    const normalizedAddress = address.toLowerCase();
    let versions = [ComplicationV1, ComplicationV2];

    for (let version of versions) {
      if (version.supportsAddress(normalizedAddress)) {
        const complication = new version(chainId);
        if (complication.address !== normalizedAddress) {
          throw new Error("Invalid complication address for chain");
        }
        return complication;
      }
    }

    throw new Error("Unsupported complication address");
  }
  return new Default(chainId);
}
