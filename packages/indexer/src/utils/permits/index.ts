import { keccak256 } from "@ethersproject/solidity";
import { Permit } from "@reservoir0x/sdk/dist/router/v6/types";
import stringify from "json-stable-stringify";

import { redis } from "@/common/redis";

export const getPermitId = (requestPayload: object, additionalData: object) =>
  keccak256(["string"], [stringify({ requestPayload, additionalData })]);

export const savePermit = async (id: string, permit: Permit, expiresIn = 10 * 60) =>
  expiresIn === 0
    ? redis.set(id, JSON.stringify(permit), "KEEPTTL")
    : redis.set(id, JSON.stringify(permit), "EX", expiresIn);

export const getPermit = async (id: string) =>
  redis.get(id).then((s) => (s ? (JSON.parse(s) as Permit) : undefined));
