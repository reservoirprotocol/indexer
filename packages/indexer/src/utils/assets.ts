import _ from "lodash";
import { MergeRefs, ReqRefDefaults } from "@hapi/hapi";
import { config } from "../config";
import { logger } from "@/common/logger";
import crypto from "crypto-js";

export enum ImageSize {
  small = 250,
  medium = 512,
  large = 1000,
}

export class Assets {
  public static getLocalAssetsLink(assets: string | string[]) {
    if (_.isEmpty(assets) || assets == "") {
      return undefined;
    }

    try {
      if (config.enableImageResizing) {
        if (_.isArray(assets)) {
          return assets.map((asset) => {
            return this.signImage(asset);
          });
        }
        return this.signImage(assets);
      }
    } catch (error) {
      logger.error("getLocalAssetsLink", `Error: ${error}`);
    }

    return assets;

    // const baseUrl = `https://${getSubDomain()}.reservoir.tools/assets/v1?`;
    //
    // if (_.isArray(assets)) {
    //   const assetsResult = [];
    //   for (const asset of _.filter(assets, (a) => !_.isNull(a))) {
    //     const queryParams = new URLSearchParams();
    //     queryParams.append("asset", encrypt(asset));
    //     assetsResult.push(`${baseUrl}${queryParams.toString()}`);
    //   }
    //
    //   return assetsResult;
    // } else {
    //   const queryParams = new URLSearchParams();
    //   queryParams.append("asset", encrypt(assets));
    //
    //   return `${baseUrl}${queryParams.toString()}`;
    // }
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

  public static getResizedImageUrl(imageUrl: string, size: number): string {
    try {
      if (config.enableImageResizing) {
        return Assets.signImage(imageUrl, size);
      }
    } catch (error) {
      logger.error("getResizedImageUrl", `Error: ${error}`);
    }

    if (imageUrl?.includes("lh3.googleusercontent.com")) {
      if (imageUrl.match(/=s\d+$/)) {
        return imageUrl.replace(/=s\d+$/, `=s${size}`);
      } else {
        return `${imageUrl}=s${size}`;
      }
    }

    if (imageUrl?.includes("i.seadn.io")) {
      if (imageUrl.match(/w=\d+/)) {
        return imageUrl.replace(/w=\d+/, `w=${size}`);
      } else {
        return `${imageUrl}?w=${size}`;
      }
    }

    return imageUrl;
  }

  public static computeKeccakHash(queryString: string) {
    return crypto.SHA3(queryString, { outputLength: 256 });
  }

  public static deriveSignature(hash: crypto.lib.WordArray) {
    if (config.privateImageResizingSigningKey == null) {
      throw new Error("Private image resizing signing key is not set");
    }

    const hmac = crypto.HmacSHA256(hash, config.privateImageResizingSigningKey);
    const signature = hmac.toString(crypto.enc.Hex);
    return signature;
  }

  public static signImage(imageUrl: string, width?: number): string {
    if (config.imageResizingBaseUrl == null) {
      throw new Error("Image resizing base URL is not set");
    } else if (config.privateImageResizingSigningKey == null) {
      throw new Error("Private image resizing signing key is not set");
    }

    const queryString = "image=" + imageUrl + (width ? "&width=" + width : "");
    const hash = this.computeKeccakHash(queryString);
    const signature = this.deriveSignature(hash);
    const shortSignature = signature.substr(0, 6);

    return `${config.imageResizingBaseUrl}?${queryString}&signature=${shortSignature}`;
  }
}
