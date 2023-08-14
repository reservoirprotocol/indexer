import { Interface } from "@ethersproject/abi";
import { Contract } from "@ethersproject/contracts";

import { idb, redb } from "@/common/db";
import { baseProvider } from "@/common/provider";
import { fromBuffer, toBuffer } from "@/common/utils";

export type ERC721CConfig = {
  transferValidator: string;
  transferSecurityLevel: number;
  operatorWhitelistId: string;
  operatorWhitelist: string[];
  permittedContractReceiverAllowlistId: string;
  permittedContractReceiverAllowlist: string[];
};

export const getERC721CConfig = async (contract: string): Promise<ERC721CConfig> => {
  const token = new Contract(
    contract,
    new Interface([
      "function getTransferValidator() public view returns (address)",
      `function getSecurityPolicy() public view returns (
        uint8 transferSecurityLevel,
        uint120 operatorWhitelistId,
        uint120 permittedContractReceiverAllowlistId
      )`,
    ]),
    baseProvider
  );

  const [transferValidator, securityPolicy] = await Promise.all([
    token.getTransferValidator(),
    token.getSecurityPolicy(),
  ]);

  const operatorWhitelistId = securityPolicy.operatorWhitelistId.toString();
  const permittedContractReceiverAllowlistId =
    securityPolicy.permittedContractReceiverAllowlistId.toString();

  return {
    transferValidator: transferValidator.toLowerCase(),
    transferSecurityLevel: securityPolicy.transferSecurityLevel,
    operatorWhitelistId,
    operatorWhitelist: await refreshERC721COperatorWhitelist(
      transferValidator,
      operatorWhitelistId
    ),
    permittedContractReceiverAllowlistId,
    permittedContractReceiverAllowlist: await refreshERC721CPermittedContractReceiverAllowlist(
      transferValidator,
      permittedContractReceiverAllowlistId
    ),
  };
};

export const getERC721CConfigFromDB = async (
  contract: string
): Promise<ERC721CConfig | undefined> => {
  const result = await redb.oneOrNone(
    `
      SELECT
        erc721c_configs.*,
        erc721c_operator_whitelists.whitelist,
        erc721c_permitted_contract_receiver_allowlists.allowlist
      FROM erc721c_configs
      LEFT JOIN erc721c_operator_whitelists
        ON erc721c_configs.transfer_validator = erc721c_operator_whitelists.transfer_validator
        AND erc721c_configs.operator_whitelist_id = erc721c_operator_whitelists.id
      LEFT JOIN erc721c_permitted_contract_receiver_allowlists
        ON erc721c_configs.transfer_validator = erc721c_permitted_contract_receiver_allowlists.transfer_validator
        AND erc721c_configs.permitted_contract_receiver_allowlist_id = erc721c_permitted_contract_receiver_allowlists.id
      WHERE erc721c_configs.contract = $/contract/
    `,
    { contract: toBuffer(contract) }
  );
  if (!result) {
    return undefined;
  }

  return {
    transferValidator: fromBuffer(result.transfer_validator),
    transferSecurityLevel: result.transfer_security_level,
    operatorWhitelistId: result.operator_whitelist_id.toString(),
    operatorWhitelist: result.whitelist ?? [],
    permittedContractReceiverAllowlistId:
      result.permitted_contract_receiver_allowlist_id.toString(),
    permittedContractReceiverAllowlist: result.allowlist ?? [],
  };
};

export const refreshERC721CConfig = async (contract: string) => {
  const config = await getERC721CConfig(contract);
  await idb.none(
    `
      INSERT INTO erc721c_configs (
        contract,
        transfer_validator,
        transfer_security_level,
        operator_whitelist_id,
        permitted_contract_receiver_allowlist_id
      ) VALUES (
        $/contract/,
        $/transferValidator/,
        $/transferSecurityLevel/,
        $/operatorWhitelistId/,
        $/permittedContractReceiverAllowlistId/
      )
      ON CONFLICT (contract)
      DO UPDATE SET
        transfer_validator = $/transferValidator/,
        transfer_security_level = $/transferSecurityLevel/,
        operator_whitelist_id = $/operatorWhitelistId/,
        permitted_contract_receiver_allowlist_id = $/permittedContractReceiverAllowlistId/,
        updated_at = now()
    `,
    {
      contract: toBuffer(contract),
      transferValidator: toBuffer(config.transferValidator),
      transferSecurityLevel: config.transferSecurityLevel,
      operatorWhitelistId: config.operatorWhitelistId,
      permittedContractReceiverAllowlistId: config.permittedContractReceiverAllowlistId,
    }
  );

  return config;
};

export const refreshERC721COperatorWhitelist = async (transferValidator: string, id: string) => {
  const tv = new Contract(
    transferValidator,
    new Interface(["function getWhitelistedOperators(uint120 id) public view returns (address[])"]),
    baseProvider
  );

  const whitelist: string[] = await tv
    .getWhitelistedOperators(id)
    .then((r: string[]) => r.map((c: string) => c.toLowerCase()));

  await idb.none(
    `
      INSERT INTO erc721c_operator_whitelists (
        transfer_validator,
        id,
        whitelist
      ) VALUES (
        $/transferValidator/,
        $/id/,
        $/whitelist:json/
      )
      ON CONFLICT (transfer_validator, id)
      DO UPDATE SET
        whitelist = $/whitelist:json/
    `,
    {
      transferValidator: toBuffer(transferValidator),
      id,
      whitelist,
    }
  );

  return whitelist;
};

export const refreshERC721CPermittedContractReceiverAllowlist = async (
  transferValidator: string,
  id: string
) => {
  const tv = new Contract(
    transferValidator,
    new Interface([
      "function getPermittedContractReceivers(uint120 id) public view returns (address[])",
    ]),
    baseProvider
  );

  const allowlist: string[] = await tv
    .getPermittedContractReceivers(id)
    .then((r: string[]) => r.map((c: string) => c.toLowerCase()));

  await idb.none(
    `
      INSERT INTO erc721c_permitted_contract_receiver_allowlists(
        transfer_validator,
        id,
        allowlist
      ) VALUES (
        $/transferValidator/,
        $/id/,
        $/allowlist:json/
      )
      ON CONFLICT (transfer_validator, id)
      DO UPDATE SET
        allowlist = $/allowlist:json/
    `,
    {
      transferValidator: toBuffer(transferValidator),
      id,
      allowlist,
    }
  );

  return allowlist;
};

export const saveVerifiedEOA = async (transferValidator: string, address: string) =>
  idb.none(
    `
      INSERT INTO erc721_verified_eoas(
        transfer_validator,
        address
      ) VALUES (
        $/transferValidator/,
        $/address/
      ) ON CONFLICT DO NOTHING
    `,
    {
      transferValidator: toBuffer(transferValidator),
      address: toBuffer(address),
    }
  );

export const checkMarketplaceIsFiltered = async (contract: string, operators: string[]) => {
  const config = await getERC721CConfigFromDB(contract);
  if (!config) {
    return false;
  }

  if (!config.operatorWhitelist.length) {
    return false;
  }

  return !operators.every((op) => config.operatorWhitelist.includes(op));
};
