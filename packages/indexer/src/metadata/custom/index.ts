/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */

import { config } from "@/config/index";
import * as ens from "./ens";
import * as bridgeToBase from "./bridge-to-base";
import * as mintTest from "./mint-test";

const customCollection: { [key: string]: any } = {};
const custom: { [key: string]: any } = {};

export const hasCustomCollectionHandler = (contract: string) =>
  Boolean(customCollection[`${config.chainId},${contract}`]);

export const hasCustomHandler = (contract: string) =>
  Boolean(custom[`${config.chainId},${contract}`]);

// All of the below methods assume the caller ensured that a custom
// handler exists (eg. via calling the above check methods)

export const customHandleCollection = async (token: any) =>
  customCollection[`${config.chainId},${token.contract}`].fetchCollection(token);

export const customHandleToken = async (token: any) =>
  custom[`${config.chainId},${token.contract}`].fetchToken(token);

export const customHandleContractTokens = async (contract: string, continuation: string) =>
  custom[`${config.chainId},${contract}`].fetchContractTokens(null, continuation);

////////////////
// Custom Tokens
////////////////

// ENS
// custom["1,0x57f1887a8bf19b14fc0df6fd9b2acc9af147ea85"] = ens;

// Bridge to Base
custom["8453,0xea2a41c02fa86a4901826615f9796e603c6a4491"] = bridgeToBase;

// Mint test
custom["999,0xe6a65c982ffa589a934fa93ab59e6e9646f25763"] = mintTest;
