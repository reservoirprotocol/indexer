import _ from "lodash";
import { encrypt } from "@/common/utils";
import { getNetworkSettings } from "@/config/network";
import { MergeRefs, ReqRefDefaults } from "@hapi/hapi";

export class Assets {
  public static getLocalAssetsLink(assets: string | string[]) {
    if (_.isEmpty(assets) || assets == "") {
      return undefined;
    }

    const baseUrl = `https://${getNetworkSettings().subDomain}.reservoir.tools/assets/v1?`;

    if (_.isArray(assets)) {
      const assetsResult = [];
      for (const asset of _.filter(assets, (a) => !_.isNull(a))) {
        const queryParams = new URLSearchParams();
        queryParams.append("asset", encrypt(asset));
        assetsResult.push(`${baseUrl}${queryParams.toString()}`);
      }

      return assetsResult;
    } else {
      const queryParams = new URLSearchParams();
      queryParams.append("asset", encrypt(assets));

      return `${baseUrl}${queryParams.toString()}`;
    }
  }

  public static addImageParams(image: string, query: MergeRefs<ReqRefDefaults>["Query"]): string {
    const splitImage = image.split(`?`);
    const baseUrl = splitImage[0];
    const url = new URL(image);
    const queryParams = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      queryParams.append(key, value);
      url.searchParams.delete(key);
    }
    url.searchParams.forEach((value, key) => {
      queryParams.append(key, value);
    });

    return `${baseUrl}?${queryParams.toString()}`;
  }
}
