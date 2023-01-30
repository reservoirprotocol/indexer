import { Signer } from "@ethersproject/abstract-signer";
import { Wallet } from "@ethersproject/wallet";
import { KmsEthersSigner } from "aws-kms-ethers-signer";

import { config } from "@/config/index";

export const Signers = {
  V1: "0x32da57e736e05f75aa4fae2e9be60fd904492726",
  V2: "0xaeb1d03929bf87f69888f381e73fbf75753d75af",
};

export const addressToSigner: { [address: string]: () => Signer } = {
  [Signers.V1]: () => new Wallet(config.oraclePrivateKey),
  [Signers.V2]: () => {
    const signer = new KmsEthersSigner({
      keyId: config.oracleAwsKmsKeyId,
      kmsClientConfig: {
        credentials: {
          accessKeyId: config.awsAccessKeyId,
          secretAccessKey: config.awsSecretAccessKey,
        },
        region: config.oracleAwsKmsKeyRegion,
      },
    });

    const oldSignMessage = signer.signMessage.bind(signer);

    // Monkey-patch the `signMessage` method to return the signature with the `0x` prefix
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (signer as any).signMessage = async (message: string) => `0x${await oldSignMessage(message)}`;

    return signer;
  },
};
