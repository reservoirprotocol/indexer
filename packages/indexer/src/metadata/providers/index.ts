import _ from "lodash";
import { raribleMetadataProvider } from "./rarible-metadata-provider";
import { openseaMetadataProvider } from "./opensea-metadata-provider";
import { onchainMetadataProvider } from "./onchain-metadata-provider";
import { simplehashMetadataProvider } from "./simplehash-metadata-provider";
import { soundxyzMetadataProvider } from "./soundxyz-metadata-provider";
import { AbstractBaseMetadataProvider } from "./abstract-base-metadata-provider";

export const MetadataProviders: AbstractBaseMetadataProvider[] = [
  raribleMetadataProvider,
  openseaMetadataProvider,
  onchainMetadataProvider,
  simplehashMetadataProvider,
  soundxyzMetadataProvider,
];

export const MetadataProvidersMap = _.keyBy(MetadataProviders, "method");
