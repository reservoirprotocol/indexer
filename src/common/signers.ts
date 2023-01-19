import { Wallet } from "@ethersproject/wallet";
import { KmsEthersSigner } from "aws-kms-ethers-signer";

import { config } from "@/config/index";

// Deprecated
export const getOracleRawSigner = () => new Wallet(config.oraclePrivateKey!);

export const getOracleKmsSigner = () =>
  new KmsEthersSigner({
    keyId: config.oracleAwsKmsKeyId,
    kmsClientConfig: {
      credentials: {
        accessKeyId: config.awsAccessKeyId,
        secretAccessKey: config.awsSecretAccessKey,
      },
      region: config.oracleAwsKmsKeyRegion!,
    },
  });
