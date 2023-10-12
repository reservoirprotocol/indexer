/* eslint-disable @typescript-eslint/no-explicit-any */

import { baseProvider } from "@/common/provider";
import { TokenMetadata } from "@/metadata/types";

import { Interface } from "@ethersproject/abi";
import { Contract } from "@ethersproject/contracts";
import axios from "axios";

export const extend = async (metadata: TokenMetadata) => {
  const nft = new Contract(
    metadata.contract,
    new Interface(["function tokenURI(uint256 tokenId) view returns (string)"]),
    baseProvider
  );

  const tokenUri = await nft.tokenURI(metadata.tokenId).then((uri: string) =>
    // Get rid of the initial `ipfs://`
    uri.slice(7)
  );
  const newMetadata = await axios
    .get(`https://cf-ipfs.com/ipfs/${tokenUri}`)
    .then((response) => response.data);

  const attributesMap: any = {};
  const attributes = newMetadata.attributes.map((a: any) => {
    attributesMap[a.trait_type] = a.value;
    return {
      key: a.trait_type ?? "property",
      value: a.value,
      kind: "string",
      rank: 1,
    };
  });

  let imageUrl;
  let mediaUrl;
  switch (`${attributesMap["ESSENCE"]}-${attributesMap["STATE"]}`) {
    case "BLACKOUT-FORGED": {
      imageUrl =
        "https://i.seadn.io/gae/kz3L7quLAs_Z07ECoB4s0nI_XC0WLYyGigw8PGQGUmejJaHixJ6UOaALU_k7ura1SpxLLKFId8LiKphH6YdYK5-7Xlk-yEUzKG68Hw?w=500&auto=format";
      mediaUrl = "https://openseauserdata.com/files/636617a79e713bd665d267828025bc21.mp4";
      break;
    }

    case "BLACKOUT-HUBBED": {
      imageUrl =
        "https://i.seadn.io/gae/XF7CAo6r-GGLmEPqUnNaGRTa6ZuEtnIJeILUuLRtDJrINCt8IsWr-o1AqXuVt6PmefS2VL4OH8hNA7lYAdiEsmrKhbvTPAap-IgkGA?w=500&auto=format";
      mediaUrl = "https://openseauserdata.com/files/636617a79e713bd665d267828025bc21.mp4";
      break;
    }

    case "ICE-FORGED": {
      imageUrl =
        "https://i.seadn.io/gae/Fh-8t7bWwIn1ER0X4hr0l15rAfckFdsfS7b-n3H0UguOjLrBYZcB0YugSBrnE0HyIRS-xaATdnNomazpcvIlAEizKjnNHKeQ5U8aD-o?w=500&auto=format";
      mediaUrl = "https://openseauserdata.com/files/f97ef45fb79ea6cb1acb3734fa56f635.mp4";
      break;
    }

    case "ICE-HUBBED": {
      imageUrl =
        "https://i.seadn.io/gae/66FT_eBSHLeMpcINgD3RlzlWVGsSx2d7gj2E6IXmKxLQb95Rl1P1C0b-csASgxdQL4yRGdGCvNBFztjcQ7XHD8hK8MxLWfkbYv-t0w?w=500&auto=format";
      mediaUrl = "https://openseauserdata.com/files/f97ef45fb79ea6cb1acb3734fa56f635.mp4";
      break;
    }

    case "SPACE MATTER-FORGED": {
      imageUrl =
        "https://i.seadn.io/gae/fVLKlq64gPRTQ53jOMduPnoRMGWIgXbDcUVxG2kKAlrGdXJ1cyFk-EUuTQW-BkoMcEvIpIVUBl08AENGvgfqz6Frzlfvsnb_GYo_?w=500&auto=format";
      mediaUrl = "https://openseauserdata.com/files/e3ea6181e301e6cee689b40229d4df68.mp4";
      break;
    }

    case "SPACE MATTER-HUBBED": {
      imageUrl =
        "https://i.seadn.io/gae/Lq-JK3fIhQSgg6hlt1YdoKRoKAvGXnDyDgMCQXBFcMiFRHTLaJsiZ3jv6OlUmJtCpmrnBgLTpAkUiOs2lUeBq3IZafhbeQv2xJa2ew?w=500&auto=format";
      mediaUrl = "https://openseauserdata.com/files/e3ea6181e301e6cee689b40229d4df68.mp4";
      break;
    }

    case "STONE-FORGED": {
      imageUrl =
        "https://i.seadn.io/gae/ucDy8PPrHTSqo2Xz-QF5uea6lnZd5pRoyuN3cru5HwEgAP-3Ah9t0m1fEq2wUUA9c9AE4cbKh--LOdPpLHP0lQDu4tawyDRd6Qbt9pw?w=500&auto=format";
      mediaUrl = "https://openseauserdata.com/files/ff4aa5e2e1bcc5d6087829807a09c2d4.mp4";
      break;
    }

    case "STONE-HUBBED": {
      imageUrl =
        "https://i.seadn.io/gae/T54AlNJkoEWMWgqIjoeI0wAG2I5n3Ks_dyZyujlhkdziETgpyQbH2I7eegNSpjKv7D2_3VePxDIKArp0XJT9D5qUz0d6Xwc1re9jaWw?w=500&auto=format";
      mediaUrl = "https://openseauserdata.com/files/ff4aa5e2e1bcc5d6087829807a09c2d4.mp4";
      break;
    }
  }

  return {
    ...metadata,
    attributes,
    imageUrl,
    mediaUrl,
  };
};
