/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */

import { config } from "@/config/index";
import * as othersideKoda from "./otherside-koda";
import * as bridgeToBase from "./bridge-to-base";
import * as mintTest from "./mint-test";

const customCollection: { [key: string]: any } = {};
const custom: { [key: string]: any } = {};
const customTokenURI: { [key: string]: any } = {};

export const hasCustomCollectionHandler = (contract: string) =>
  Boolean(customCollection[`${config.chainId},${contract}`]);

export const hasCustomHandler = (contract: string) =>
  Boolean(custom[`${config.chainId},${contract}`]);

export const hasCustomTokenURIHandler = (contract: string) =>
  Boolean(customTokenURI[`${config.chainId},${contract}`]);

// All of the below methods assume the caller ensured that a custom
// handler exists (eg. via calling the above check methods)

export const customHandleCollection = async (token: any) =>
  customCollection[`${config.chainId},${token.contract}`].fetchCollection(token);

export const customHandleToken = async (token: any) =>
  custom[`${config.chainId},${token.contract}`].fetchToken(token);

export const customHandleTokenURI = async (token: any, uri: string) =>
  customTokenURI[`${config.chainId},${token.contract}`].fetchTokenURI(token, uri);

export const customHandleContractTokens = async (contract: string, continuation: string) =>
  custom[`${config.chainId},${contract}`].fetchContractTokens(null, continuation);

////////////////
// Custom Tokens
////////////////

// Otherside Koda
customTokenURI["1,0xe012baf811cf9c05c408e879c399960d1f305903"] = othersideKoda;
customTokenURI["1,0xafc1d694d3d2ea3e28e13c11bea9c9a14a1f55f6"] = othersideKoda;

// Bridge to Base
custom["8453,0xea2a41c02fa86a4901826615f9796e603c6a4491"] = bridgeToBase;

// Mint test
custom["999,0xe6a65c982ffa589a934fa93ab59e6e9646f25763"] = mintTest;
