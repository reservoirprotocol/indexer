/* eslint-disable @typescript-eslint/no-explicit-any */

import { logger } from "@/common/logger";
import { config } from "@/config/index";
import axios from "axios";

export const extendCollection = async (metadata: any, _tokenId = null) => {
  metadata.community = null;
  metadata.tokenIdRange = null;
  metadata.tokenSetId = null;

  await axios
    .get(`https://metadata.ordinals.market/emblem?token_id=${_tokenId}`, {
      headers: {
        "X-Api-Key": config.ordinalsApiKey,
      },
    })
    .then((response) => {
      const data = response.data;
      if (data.collection) {
        metadata.id = `${metadata.id}:ordinals-${data.collection.id}`;
        metadata.community = "ordinals";
        metadata.name = data.collection.name;
        metadata.metadata = {
          description: data.collection.description,
          imageUrl: data.collection.image_url,
          discordUrl: data.collection.discord_url,
          externalUrl: data.collection.external_url,
          twitterUsername: data.collection.twitter_username,
        };
        metadata.royalties = data.collection.royalties.filter(
          ({ bps }: { bps: number }) => bps !== 0
        );
      } else {
        metadata.isFallback = true;
      }
    })
    .catch((error) => {
      logger.error(
        "ordinals-fetcher-collection",
        `fetchTokens error.  message:${error.message},  status:${
          error.response?.status
        }, data:${JSON.stringify(error.response?.data)}`
      );
    });

  return metadata;
};

export const extend = async (metadata: any) => {
  await axios
    .get(`https://metadata.ordinals.market/emblem?token_id=${metadata.tokenId}`, {
      headers: {
        "X-Api-Key": config.ordinalsApiKey,
      },
    })
    .then((response) => {
      logger.info(
        "ordinals-fetcher-token",
        `fetchTokens response. data:${JSON.stringify(response.data)} contract:${
          metadata.collection
        } tokenId:${metadata.tokenId}`
      );

      const data = response.data;
      if (data.collection && data.token) {
        metadata.collection = `${metadata.collection}:ordinals-${data.collection.id}`;
        metadata.name = data.token.name;
        metadata.imageUrl = data.token.image_url;
        metadata.attributes = data.token.attributes.map((trait: any) => ({
          ...trait,
          rank: 1,
        }));
      }
    })
    .catch((error) => {
      logger.error(
        "ordinals-fetcher-token",
        `fetchTokens error. message:${error.message},  status:${
          error.response?.status
        }, data:${JSON.stringify(error.response?.data)} contract:${metadata.collection} tokenId:${
          metadata.tokenId
        }`
      );

      throw error;
    });

  return metadata;
};
