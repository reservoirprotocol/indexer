import _ from "lodash";
import { txdb, pgp } from "@/common/db";

export type ContractAddress = {
  address: string;
  deploymentTxHash: string;
  deploymentSender: string;
  deploymentFactory: string;
  bytecode: string;
};

export const saveContractAddresses = async (contractAddresses: ContractAddress[]) => {
  if (_.isEmpty(contractAddresses)) {
    return;
  }

  const columns = new pgp.helpers.ColumnSet(
    ["address", "deployment_tx_hash", "deployment_sender", "deployment_factory", "bytecode"],
    { table: "contract_addresses" }
  );

  const contractAddressesValues = _.map(contractAddresses, (contractAddress) => ({
    address: contractAddress.address,
    deployment_tx_hash: contractAddress.deploymentTxHash,
    deployment_sender: contractAddress.deploymentSender,
    deployment_factory: contractAddress.deploymentFactory,
    bytecode: contractAddress.bytecode,
  }));

  await txdb.none(
    `
      INSERT INTO contract_addresses (
        address,
        deployment_tx_hash,
        deployment_sender,
        deployment_factory,
        bytecode
      ) VALUES ${pgp.helpers.values(contractAddressesValues, columns)}
      ON CONFLICT DO NOTHING
    `
  );
};
