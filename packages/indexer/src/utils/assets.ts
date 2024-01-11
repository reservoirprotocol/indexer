import _ from "lodash";
import { MergeRefs, ReqRefDefaults } from "@hapi/hapi";
import { config } from "../config";
import { logger } from "@/common/logger";
import crypto from "crypto-js";
import { getNetworkName } from "@/config/network";

const IMAGE_RESIZE_WORKER_VERSION = "v2";

export enum ImageSize {
  small = 250,
  medium = 512,
  large = 1000,
}

export class Assets {
  public static getResizedImageURLs(
    assets: string | string[],
    size?: number,
    image_version?: number,
    image_mime_type?: string
  ) {
    if (_.isEmpty(assets) || assets == "") {
      return undefined;
    }

    try {
      if (config.enableImageResizing) {
        if (_.isArray(assets)) {
          return assets.map((asset) => {
            return this.getResizedImageUrl(asset, size, image_version, image_mime_type);
          });
        }
        return this.getResizedImageUrl(assets, size, image_version, image_mime_type);
      }
    } catch (error) {
      // logger.error("getLocalAssetsLink", `Error: ${error}`);
      return [];
    }

    return assets;
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

  public static getResizedImageUrl(
    imageUrl: string,
    size?: number,
    image_version?: number,
    image_mime_type?: string
  ): string {
    if (imageUrl) {
      try {
        if (config.enableImageResizing) {
          let resizeImageUrl = imageUrl;
          if (imageUrl?.includes("lh3.googleusercontent.com")) {
            if (imageUrl.match(/=s\d+$/)) {
              resizeImageUrl = imageUrl.replace(/=s\d+$/, `=s${ImageSize.large}`);
            }
          } else if (imageUrl?.includes("i.seadn.io")) {
            if (imageUrl.match(/w=\d+/)) {
              resizeImageUrl = imageUrl.replace(/w=\d+/, `w=${ImageSize.large}`);
            }

            return Assets.signImage(resizeImageUrl, size, image_version, image_mime_type);
          }

          return Assets.signImage(resizeImageUrl, size, image_version, image_mime_type);
        }
      } catch (error) {
        logger.error(
          "getResizedImageUrl",
          JSON.stringify({
            message: `imageUrl=${imageUrl}, size=${size}, image_version=${image_version}, image_mime_type=${image_mime_type}, error=${error}`,
            error,
          })
        );
      }
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

  public static signImage(
    imageUrl: string,
    width?: number,
    image_version?: number,
    image_mime_type?: string
  ): string {
    const validImagePrefixes = ["http", "data:image"];
    if (config.imageResizingBaseUrl == null) {
      throw new Error("Image resizing base URL is not set");
    } else if (config.privateImageResizingSigningKey == null) {
      throw new Error("Private image resizing signing key is not set");
    } else if (imageUrl == null) {
      throw new Error("Image URL is not set");
    } else if (!validImagePrefixes.some((prefix) => imageUrl.startsWith(prefix))) {
      throw new Error("Image URL is not valid");
    }

    let v = "";
    if (image_version) {
      try {
        v = image_version ? `?v=${Math.floor(new Date(image_version).getTime() / 1000)}` : "";
        if (imageUrl.includes("?")) {
          v = v.replace("?", "&");
        }
      } catch (error) {
        logger.error("signImage", `Error: ${error}`);
      }
    }

    const ciphertext = crypto.AES.encrypt(
      imageUrl + v,
      crypto.enc.Hex.parse(config.privateImageResizingSigningKey),
      {
        iv: crypto.enc.Utf8.parse(config.privateImageResizingSigningKey),
        mode: crypto.mode.CBC,
        padding: crypto.pad.Pkcs7,
      }
    ).toString();

    const fileExtension = Assets.getFileExtension(image_mime_type);

    return `${
      config.imageResizingBaseUrl
    }/${IMAGE_RESIZE_WORKER_VERSION}/${getNetworkName()}/${encodeURIComponent(ciphertext)}${
      fileExtension ? "." + fileExtension : ""
    }${width ? "?width=" + width : ""}`;
  }

  private static getFileExtension(mimeType: string | undefined): string {
    if (!mimeType) {
      return "";
    }
    let fileExtension = mimeType?.split("/")[1];
    if (fileExtension == "svg+xml") {
      fileExtension = "svg";
    } else if (fileExtension == "jpeg") {
      fileExtension = "jpg";
    } else if (fileExtension == "tiff") {
      fileExtension = "tif";
    } else if (fileExtension == "x-icon") {
      fileExtension = "ico";
    }

    return fileExtension;
  }
}
