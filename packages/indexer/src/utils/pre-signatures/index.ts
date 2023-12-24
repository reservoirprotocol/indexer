import { keccak256 } from "@ethersproject/solidity";
import { PreSignature } from "@reservoir0x/sdk/dist/router/v6/types";
import stringify from "json-stable-stringify";

import { redis } from "@/common/redis";

export const getPreSignatureId = (requestPayload: object, additionalData: object) =>
  keccak256(["string"], [stringify({ requestPayload, additionalData })]);

export const savePreSignature = async (id: string, permit: PreSignature, expiresIn = 10 * 60) =>
  expiresIn === 0
    ? redis.set(id, JSON.stringify(permit), "KEEPTTL")
    : redis.set(id, JSON.stringify(permit), "EX", expiresIn);

export const getPreSignature = async (id: string) =>
  redis.get(id).then((s) => (s ? (JSON.parse(s) as PreSignature) : undefined));
