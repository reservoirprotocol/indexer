/* eslint-disable @typescript-eslint/no-explicit-any */

import _ from "lodash";
import axios from "axios";
import cbor from "cbor";
import { config } from "@/config/index";

export const fetchSatInformation = async (satUri: string) => {
  const splitUri = _.split(satUri, ":");
  const tokenId = splitUri[splitUri.length - 1];
  const satNumber = splitUri[splitUri.length - 2];
  const satUrl = `${config.ordinalsMetadataUrl}/r/sat/${satNumber}/at/${tokenId}`;

  const satResponse = await axios.get(satUrl);
  const metadataUrl = `${config.ordinalsMetadataUrl}/r/metadata/${satResponse.data.id}`;
  const metadataResponse = await axios.get(metadataUrl);

  return { inscriptionId: satResponse.data.id, data: cbor.decode(metadataResponse.data) };
};

export const fetchTokenUriMetadata = async (
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  { contract, tokenId }: { contract: string; tokenId: string },
  uri: string
) => {
  const info = await fetchSatInformation(uri);
  let image = null;

  if (info?.data?.image) {
    image = `${config.ordinalsMetadataUrl}/content/${info?.inscriptionId}`;

    if (info.data.image !== uri) {
      const imageInfo = await fetchSatInformation(info.data.image);
      image = `${config.ordinalsMetadataUrl}/content/${imageInfo?.inscriptionId}`;
    }
  }

  return [
    {
      ...info?.data,
      contract,
      tokenId,
      image,
    },
    null,
  ];
};
