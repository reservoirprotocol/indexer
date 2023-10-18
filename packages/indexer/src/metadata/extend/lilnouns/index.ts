/* eslint-disable @typescript-eslint/no-explicit-any */

import { request, gql } from "graphql-request";
import { utils } from "ethers";

import nouns from "./lilnouns.json";
import { TokenMetadata } from "@/metadata/types";

const capitalizeFirstLetter = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const replaceAll = (str: string, find: string, replace: string) => str.split(find).join(replace);

export const extend = async (metadata: TokenMetadata) => {
  const traitMap = ["background", "body", "accessory", "head", "glasses"];
  const data = await request(
    "https://api.thegraph.com/subgraphs/name/lilnounsdao/lil-nouns-subgraph",
    gql`{
      auctions(where:{id: "${metadata.tokenId}"}) {
        amount
        startTime
      }
      nouns(where:{id: "${metadata.tokenId}"}) {
        seed {
          background
          body
          accessory
          head
          glasses
        }
      }
    }`
  );

  const traits = [];
  if (data.auctions[0]) {
    traits.push({
      key: "Auction Price",
      value: utils.formatEther(data.auctions[0].amount),
      kind: "string",
      rank: 1,
    });
    const date = new Date(data.auctions[0].startTime * 1000);
    const year = date.getUTCFullYear();
    const month = (date.getUTCMonth() + 1).toString().padStart(2, "0");
    const day = date.getUTCDate().toString().padStart(2, "0");
    const dateString = year + "-" + month + "-" + day;
    traits.push({
      key: "Birthdate",
      value: dateString,
      kind: "string",
      rank: 2,
    });
  }

  traitMap.forEach((trait, i) => {
    traits.push({
      key: capitalizeFirstLetter(trait),
      value: nouns[i][data.nouns[0].seed[trait]],
      kind: "string",
      rank: 7 - i,
    });
  });

  return {
    ...metadata,
    // name: metadata.name.replaceAll("Noun", "Lil Noun"),
    name: metadata?.name ? replaceAll(metadata.name, "Noun", "Lil Noun") : "",
    description: metadata?.description ? replaceAll(metadata.description, "Noun", "Lil Noun") : "",
    attributes: traits,
  };
};
