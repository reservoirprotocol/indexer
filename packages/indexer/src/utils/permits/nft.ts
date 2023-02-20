import { keccak256 } from "@ethersproject/solidity";
import { NFTPermit, NFTToken } from "@reservoir0x/sdk/dist/router/v6/types";
import stringify from "json-stable-stringify";

import { redis } from "@/common/redis";

export const getPermitId = (requestPayload: object, tokens: NFTToken[]) =>
  `nft-permit:${keccak256(["string"], [stringify({ requestPayload, tokens })])}`;

export const savePermit = async (id: string, permit: NFTPermit, expiresIn: number) =>
  expiresIn === 0
    ? redis.set(id, JSON.stringify(permit), "KEEPTTL")
    : redis.set(id, JSON.stringify(permit), "EX", expiresIn);

export const getPermit = async (id: string) =>
  redis.get(id).then((s) => (s ? (JSON.parse(s) as NFTPermit) : undefined));
