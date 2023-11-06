/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */

import { config } from "@/config/index";
import * as copyrightInfringement from "./copyright-infringement";
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

//////////////////////
// Custom Collections
//////////////////////

// Copyright Infringement
customCollection["1,0x783a32eb03a1175160d210cc99c79e6370a48317"] = copyrightInfringement;
customCollection["1,0xc80ee060c83895d6debb5eb37bf60d4d2f7eb271"] = copyrightInfringement;
customCollection["1,0x45dcf807722e43ba152d8033252398001f438817"] = copyrightInfringement;
customCollection["1,0x7219f3a405844a4173ac822ee18994823bec2b4f"] = copyrightInfringement;
customCollection["1,0x182d9d5680c2c0f50b6d40169a3a27cb94b1f2fe"] = copyrightInfringement;
customCollection["1,0xaf7416127f127f82b4ed7b0818fbd2b3e5c0e07a"] = copyrightInfringement;
customCollection["1,0xb8f2de4905576c18633a7b4b1a5422fa8ae2a8b5"] = copyrightInfringement;
customCollection["1,0xe2997a26fa424361eb6e7dc6a42ef7f72134d26e"] = copyrightInfringement;
customCollection["1,0xb795cc2d42c7921e8d6c38b4a4c05d401ad4900d"] = copyrightInfringement;
customCollection["1,0x6c09a8fe4932113c487f374833944ceecc1f42d4"] = copyrightInfringement;
customCollection["1,0xb5ce1a41a79f58f795b3a6ad8ed7eb08992931d1"] = copyrightInfringement;
customCollection["1,0x94ab8e298b32c90b6add98744ef7b51462a6bdb1"] = copyrightInfringement;
customCollection["1,0xe7182a5e91e18ce756bb237480703b5797434d0f"] = copyrightInfringement;
customCollection["1,0x28320317733e593e515a49191f64d362a2ad45aa"] = copyrightInfringement;
customCollection["1,0xc87ec359faf0e72c37195563e89a29a6b149e7aa"] = copyrightInfringement;
customCollection["1,0xdf1782703343397799d780b6f178daa83e756ef6"] = copyrightInfringement;
customCollection["1,0xe6b451d2ae69db47f77df873828e919f02edfd2a"] = copyrightInfringement;
customCollection["1,0xef90ba651d58ed5f519ca6c5e9e333cd91f2f8db"] = copyrightInfringement;
customCollection["1,0x43a1da6b942a653d65b0eb4f476bceff05bb9d77"] = copyrightInfringement;
customCollection["1,0x6dc8a052949bdd2bfa857c50721e7ecdc4c0185f"] = copyrightInfringement;
customCollection["1,0xd4f7466b52eddb4bf20c520fbe308b0961659b03"] = copyrightInfringement;
customCollection["1,0x6c4a0c95d02366a8be460108e222ddf58451d1c0"] = copyrightInfringement;
customCollection["1,0x32d753b840b475832950f6ad140b403f4a467f2c"] = copyrightInfringement;
customCollection["1,0xa6edad01bf197b0ff7c1a8a456731bd2081d6940"] = copyrightInfringement;
customCollection["1,0x254f0ed9a40b81402c86dcb5bc064dc036a5b7cc"] = copyrightInfringement;
customCollection["1,0xc7e8356dfb53576ff05bfe88c52ef72d8918bcb5"] = copyrightInfringement;
customCollection["1,0x8c00c9c6c1edcef697acac2e4b7b3678b3ed9d90"] = copyrightInfringement;
customCollection["1,0xed536e28bf08340f733ae5d49d0510289512a643"] = copyrightInfringement;
customCollection["1,0x71f6aa96bd3ea7b88334494f28b42da57fb1b926"] = copyrightInfringement;

customCollection["137,0xcf77e25cf1bfc57634bb7b95887b7120935a0d7f"] = copyrightInfringement;
customCollection["137,0x27bde07c5d651856c483583899ed6823da3648b7"] = copyrightInfringement;
customCollection["137,0x7c15f5a57a8eb8c0a3e8a68e49a1a25650d612df"] = copyrightInfringement;
customCollection["137,0xd269f864b5a7af16f0482e6a5ec4d92b542bfc5a"] = copyrightInfringement;
customCollection["137,0xca45359bea0987ac0a0e35d8bdde2724415ec69e"] = copyrightInfringement;
customCollection["137,0xca75456ceb3a3158022b6e22816995ae458ba05a"] = copyrightInfringement;
customCollection["137,0x452f032761efe3d10de4abb43e302774c7aabb12"] = copyrightInfringement;
customCollection["137,0x5919fc8d26cf5869cd892a752b67e31c35357bfb"] = copyrightInfringement;
customCollection["137,0xfd6b19ed681d621277d372fe9585dfe9b8a95510"] = copyrightInfringement;
customCollection["137,0x2f4d2f39e3dbcd02499b1121a25e13c1b2be67ac"] = copyrightInfringement;
customCollection["137,0x7252956b34bf2e44d50e7eafb55361b7601b4d74"] = copyrightInfringement;
customCollection["137,0xa262a98d9fa0a29f4c1224d52b9ff4197b6ce62d"] = copyrightInfringement;
customCollection["137,0xa28a24946ffb7a38c2dcde5bb536c201f4319429"] = copyrightInfringement;
customCollection["137,0x64d0455776b4343542c8e49f89b3546413bdd38b"] = copyrightInfringement;
customCollection["137,0xbeeb1915d2bf74929d8fd05af7df076206bd2165"] = copyrightInfringement;
customCollection["137,0x65f3371e55cd365e147719910bd2f6862d07e9ef"] = copyrightInfringement;

customCollection["5,0x002cb3af46ad013a98b174a61711c0f725084bc0"] = copyrightInfringement;

// Emblem Vault - temporary to prevent trading during migration
customCollection["1,0x82c7a8f707110f5fbb16184a5933e9f78a34c6ab"] = copyrightInfringement;

////////////////
// Custom Tokens
////////////////

// Copyright Infringement
custom["1,0x783a32eb03a1175160d210cc99c79e6370a48317"] = copyrightInfringement;
custom["1,0xc80ee060c83895d6debb5eb37bf60d4d2f7eb271"] = copyrightInfringement;
custom["1,0x45dcf807722e43ba152d8033252398001f438817"] = copyrightInfringement;
custom["1,0x7219f3a405844a4173ac822ee18994823bec2b4f"] = copyrightInfringement;
custom["1,0x182d9d5680c2c0f50b6d40169a3a27cb94b1f2fe"] = copyrightInfringement;
custom["1,0xaf7416127f127f82b4ed7b0818fbd2b3e5c0e07a"] = copyrightInfringement;
custom["1,0xb8f2de4905576c18633a7b4b1a5422fa8ae2a8b5"] = copyrightInfringement;
custom["1,0xe2997a26fa424361eb6e7dc6a42ef7f72134d26e"] = copyrightInfringement;
custom["1,0xb795cc2d42c7921e8d6c38b4a4c05d401ad4900d"] = copyrightInfringement;
custom["1,0x6c09a8fe4932113c487f374833944ceecc1f42d4"] = copyrightInfringement;
custom["1,0xb5ce1a41a79f58f795b3a6ad8ed7eb08992931d1"] = copyrightInfringement;
custom["1,0x94ab8e298b32c90b6add98744ef7b51462a6bdb1"] = copyrightInfringement;
custom["1,0xe7182a5e91e18ce756bb237480703b5797434d0f"] = copyrightInfringement;
custom["1,0x28320317733e593e515a49191f64d362a2ad45aa"] = copyrightInfringement;
custom["1,0xc87ec359faf0e72c37195563e89a29a6b149e7aa"] = copyrightInfringement;
custom["1,0xdf1782703343397799d780b6f178daa83e756ef6"] = copyrightInfringement;
custom["1,0xe6b451d2ae69db47f77df873828e919f02edfd2a"] = copyrightInfringement;
custom["1,0xef90ba651d58ed5f519ca6c5e9e333cd91f2f8db"] = copyrightInfringement;
custom["1,0x43a1da6b942a653d65b0eb4f476bceff05bb9d77"] = copyrightInfringement;
custom["1,0x6dc8a052949bdd2bfa857c50721e7ecdc4c0185f"] = copyrightInfringement;
custom["1,0xd4f7466b52eddb4bf20c520fbe308b0961659b03"] = copyrightInfringement;
custom["1,0x6c4a0c95d02366a8be460108e222ddf58451d1c0"] = copyrightInfringement;
custom["1,0x32d753b840b475832950f6ad140b403f4a467f2c"] = copyrightInfringement;
custom["1,0xa6edad01bf197b0ff7c1a8a456731bd2081d6940"] = copyrightInfringement;
custom["1,0x254f0ed9a40b81402c86dcb5bc064dc036a5b7cc"] = copyrightInfringement;
custom["1,0xc7e8356dfb53576ff05bfe88c52ef72d8918bcb5"] = copyrightInfringement;
custom["1,0x8c00c9c6c1edcef697acac2e4b7b3678b3ed9d90"] = copyrightInfringement;
custom["1,0xed536e28bf08340f733ae5d49d0510289512a643"] = copyrightInfringement;
custom["1,0x71f6aa96bd3ea7b88334494f28b42da57fb1b926"] = copyrightInfringement;

custom["137,0xcf77e25cf1bfc57634bb7b95887b7120935a0d7f"] = copyrightInfringement;
custom["137,0x27bde07c5d651856c483583899ed6823da3648b7"] = copyrightInfringement;
custom["137,0x7c15f5a57a8eb8c0a3e8a68e49a1a25650d612df"] = copyrightInfringement;
custom["137,0xd269f864b5a7af16f0482e6a5ec4d92b542bfc5a"] = copyrightInfringement;
custom["137,0xca45359bea0987ac0a0e35d8bdde2724415ec69e"] = copyrightInfringement;
custom["137,0xca75456ceb3a3158022b6e22816995ae458ba05a"] = copyrightInfringement;
custom["137,0x452f032761efe3d10de4abb43e302774c7aabb12"] = copyrightInfringement;
custom["137,0x5919fc8d26cf5869cd892a752b67e31c35357bfb"] = copyrightInfringement;
custom["137,0xfd6b19ed681d621277d372fe9585dfe9b8a95510"] = copyrightInfringement;
custom["137,0x2f4d2f39e3dbcd02499b1121a25e13c1b2be67ac"] = copyrightInfringement;
custom["137,0x7252956b34bf2e44d50e7eafb55361b7601b4d74"] = copyrightInfringement;
custom["137,0xa262a98d9fa0a29f4c1224d52b9ff4197b6ce62d"] = copyrightInfringement;
custom["137,0xa28a24946ffb7a38c2dcde5bb536c201f4319429"] = copyrightInfringement;
custom["137,0x64d0455776b4343542c8e49f89b3546413bdd38b"] = copyrightInfringement;
custom["137,0xbeeb1915d2bf74929d8fd05af7df076206bd2165"] = copyrightInfringement;
custom["137,0x65f3371e55cd365e147719910bd2f6862d07e9ef"] = copyrightInfringement;

custom["5,0x002cb3af46ad013a98b174a61711c0f725084bc0"] = copyrightInfringement;

// Emblem Vault - temporary to prevent trading during migration
custom["1,0x82c7a8f707110f5fbb16184a5933e9f78a34c6ab"] = copyrightInfringement;

// ENS
custom["1,0x57f1887a8bf19b14fc0df6fd9b2acc9af147ea85"] = ens;

// Bridge to Base
custom["8453,0xea2a41c02fa86a4901826615f9796e603c6a4491"] = bridgeToBase;

// Mint test
custom["999,0xe6a65c982ffa589a934fa93ab59e6e9646f25763"] = mintTest;
