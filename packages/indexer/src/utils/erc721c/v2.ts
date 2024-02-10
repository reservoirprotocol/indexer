import { Interface } from "@ethersproject/abi";
import { Contract } from "@ethersproject/contracts";

import { idb, redb } from "@/common/db";
import { baseProvider } from "@/common/provider";
import { fromBuffer, toBuffer } from "@/common/utils";
import { orderRevalidationsJob } from "@/jobs/order-fixes/order-revalidations-job";

enum TransferSecurityLevel {
  Recommended,
  Zero,
  One,
  Two,
  Three,
  Four,
  Five,
  Six,
  Seven,
}

export type ERC721CV2Config = {
  transferValidator: string;
  transferSecurityLevel: TransferSecurityLevel;
  listId: string;
  blacklist: List;
  whitelist: List;
};

export type List = {
  accounts: string[];
  codeHashes: string[];
};

export const getConfig = async (contract: string): Promise<ERC721CV2Config | undefined> => {
  try {
    const token = new Contract(
      contract,
      new Interface(["function getTransferValidator() view returns (address)"]),
      baseProvider
    );

    const transferValidatorAddress = await token.getTransferValidator();
    const transferValidator = new Contract(
      transferValidatorAddress,
      new Interface([
        `
          function getCollectionSecurityPolicyV2(address collection) view returns (
            uint8 transferSecurityLevel,
            uint120 listId
          )
        `,
      ]),
      baseProvider
    );

    const securityPolicy = await transferValidator.getCollectionSecurityPolicyV2(contract);

    const listId = securityPolicy.listId.toString();

    return {
      transferValidator: transferValidatorAddress.toLowerCase(),
      transferSecurityLevel: securityPolicy.transferSecurityLevel,
      listId,
      whitelist: await refreshWhitelist(transferValidatorAddress, listId),
      blacklist: await refreshBlacklist(transferValidatorAddress, listId),
    };
  } catch {
    // Skip errors
  }

  return undefined;
};

export const getConfigFromDb = async (contract: string): Promise<ERC721CV2Config | undefined> => {
  const result = await redb.oneOrNone(
    `
      SELECT
        erc721c_v2_configs.*,
        erc721c_v2_lists.blacklist,
        erc721c_v2_lists.whitelist
      FROM erc721c_v2_configs
      LEFT JOIN erc721c_v2_lists
        ON erc721c_v2_configs.transfer_validator = erc721c_v2_lists.transfer_validator
        AND erc721c_v2_configs.list_id = erc721c_v2_lists.id
      WHERE erc721c_v2_configs.contract = $/contract/
    `,
    { contract: toBuffer(contract) }
  );
  if (!result) {
    return undefined;
  }

  return {
    transferValidator: fromBuffer(result.transfer_validator),
    transferSecurityLevel: result.transfer_security_level,
    listId: result.list_id,
    whitelist: result.whitelist ?? [],
    blacklist: result.blacklist ?? [],
  };
};

export const refreshConfig = async (contract: string) => {
  const config = await getConfig(contract);
  if (config) {
    await idb.none(
      `
        INSERT INTO erc721c_v2_configs (
          contract,
          transfer_validator,
          transfer_security_level,
          list_id
        ) VALUES (
          $/contract/,
          $/transferValidator/,
          $/transferSecurityLevel/,
          $/listId/
        )
        ON CONFLICT (contract)
        DO UPDATE SET
          transfer_validator = $/transferValidator/,
          transfer_security_level = $/transferSecurityLevel/,
          list_id = $/listId/,
          updated_at = now()
      `,
      {
        contract: toBuffer(contract),
        transferValidator: toBuffer(config.transferValidator),
        transferSecurityLevel: config.transferSecurityLevel,
        listId: config.listId,
      }
    );

    return config;
  }

  return undefined;
};

export const refreshWhitelist = async (transferValidator: string, id: string) => {
  const tv = new Contract(
    transferValidator,
    new Interface([
      "function getWhitelistedAccounts(uint120 id) public view returns (address[])",
      "function getWhitelistedCodeHashes(uint120 id) public view returns (bytes32[])",
    ]),
    baseProvider
  );

  const accounts: string[] = await tv
    .getWhitelistedAccounts(id)
    .then((r: string[]) => r.map((c: string) => c.toLowerCase()));

  const codeHashes: string[] = await tv
    .getWhitelistedCodeHashes(id)
    .then((r: string[]) => r.map((c: string) => c.toLowerCase()));

  const whitelist = {
    accounts,
    codeHashes,
  };

  await idb.none(
    `
      INSERT INTO erc721c_v2_lists(
        transfer_validator,
        id,
        blacklist,
        whitelist
      ) VALUES (
        $/transferValidator/,
        $/id/,
        $/blacklist:json/,
        $/whitelist:json/
      )
      ON CONFLICT (transfer_validator, id)
      DO UPDATE SET
        whitelist = $/whitelist:json/
    `,
    {
      transferValidator: toBuffer(transferValidator),
      id,
      blacklist: [],
      whitelist,
    }
  );

  const relevantContracts = await idb.manyOrNone(
    `
      SELECT
        erc721c_v2_configs.contract
      FROM erc721c_v2_configs
      WHERE erc721c_v2_configs.transfer_validator = $/transferValidator/
        AND erc721c_v2_configs.list_id = $/id/
        AND erc721c_v2_configs.transfer_security_level IN (0, 3, 4, 5, 6, 7, 8)
      LIMIT 1000
    `,
    {
      transferValidator: toBuffer(transferValidator),
      id,
    }
  );

  // Invalid any orders relying on blacklisted operators
  await orderRevalidationsJob.addToQueue(
    relevantContracts.map((c) => ({
      by: "operator",
      data: {
        origin: "erc721c-v2",
        contract: fromBuffer(c.contract),
        whitelistedOperators: whitelist.accounts,
        status: "inactive",
      },
    }))
  );

  return whitelist;
};

export const refreshBlacklist = async (transferValidator: string, id: string) => {
  const tv = new Contract(
    transferValidator,
    new Interface([
      "function getBlacklistedAccounts(uint120 id) public view returns (address[])",
      "function getBlacklistedCodeHashes(uint120 id) public view returns (bytes32[])",
    ]),
    baseProvider
  );

  const accounts: string[] = await tv
    .getBlacklistedAccounts(id)
    .then((r: string[]) => r.map((c: string) => c.toLowerCase()));

  const codeHashes: string[] = await tv
    .getBlacklistedCodeHashes(id)
    .then((r: string[]) => r.map((c: string) => c.toLowerCase()));

  const blacklist = {
    accounts,
    codeHashes,
  };

  await idb.none(
    `
      INSERT INTO erc721c_v2_lists(
        transfer_validator,
        id,
        blacklist,
        whitelist
      ) VALUES (
        $/transferValidator/,
        $/id/,
        $/blacklist:json/,
        $/whitelist:json/
      )
      ON CONFLICT (transfer_validator, id)
      DO UPDATE SET
        blacklist = $/blacklist:json/
    `,
    {
      transferValidator: toBuffer(transferValidator),
      id,
      blacklist,
      whitelist: [],
    }
  );

  const relevantContracts = await idb.manyOrNone(
    `
      SELECT
        erc721c_v2_configs.contract
      FROM erc721c_v2_configs
      WHERE erc721c_v2_configs.transfer_validator = $/transferValidator/
        AND erc721c_v2_configs.list_id = $/id/
        AND erc721c_v2_configs.transfer_security_level IN (2)
      LIMIT 1000
    `,
    {
      transferValidator: toBuffer(transferValidator),
      id,
    }
  );

  // Invalid any orders relying on blacklisted operators
  await orderRevalidationsJob.addToQueue(
    relevantContracts.map((c) => ({
      by: "operator",
      data: {
        origin: "erc721c-v2",
        contract: fromBuffer(c.contract),
        blacklistedOperators: blacklist.accounts,
        status: "inactive",
      },
    }))
  );

  return blacklist;
};

function getListByConfig(config: ERC721CV2Config): {
  whitelist?: string[];
  blacklist?: string[];
} {
  switch (config.transferSecurityLevel) {
    // No restrictions
    case TransferSecurityLevel.Zero: {
      return {};
    }

    // Blacklist restrictions
    case TransferSecurityLevel.One: {
      return {
        blacklist: config.blacklist.accounts,
      };
    }

    // Whitelist restrictions
    default: {
      return {
        whitelist: config.whitelist.accounts,
      };
    }
  }
}

export const checkMarketplaceIsFiltered = async (contract: string, operators: string[]) => {
  const config = await getConfigFromDb(contract);
  if (!config) {
    return false;
  }

  const { whitelist, blacklist } = getListByConfig(config);

  if (whitelist) {
    return whitelist.length ? operators.some((op) => !whitelist.includes(op)) : true;
  } else if (blacklist) {
    return blacklist.length ? operators.some((op) => blacklist.includes(op)) : false;
  } else {
    return false;
  }
};
