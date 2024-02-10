import { TypedDataDomain, TypedDataField } from "@ethersproject/abstract-signer";
import axios from "axios";

import { idb } from "@/common/db";
import { toBuffer } from "@/common/utils";

export type ExternalCosigner = {
  signer: string;
  endpoint: string;
  apiKey: string;
};

export type CosignRequest = {
  signer: string;
  method: "eth_signTypedData_v4";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  params: any[];
};

export type CosignResponse = {
  signature: string;
};

export const upsertExternalCosigner = async (key: ExternalCosigner, apiKey: string) => {
  const existingResult = await idb.oneOrNone(
    `
      SELECT
        cosigners.signer,
        cosigners.endpoint,
        cosigners.api_key
      FROM cosigners
      WHERE cosigners.signer = $/signer/
    `,
    {
      signer: toBuffer(key.signer),
    }
  );

  if (existingResult && existingResult.api_key !== apiKey) {
    throw Error("Unauthorized");
  }

  await idb.none(
    `
      INSERT INTO cosigners (
        signer,
        endpoint,
        api_key
      ) VALUES (
        $/signer/,
        $/endpoint/,
        $/apiKey/
      ) ON CONFLICT (signer) DO UPDATE SET
        endpoint = $/endpoint/,
        api_key = $/apiKey/,
        updated_at = now()
    `,
    {
      signer: toBuffer(key.signer),
      endpoint: key.endpoint,
      api_key: key.apiKey,
    }
  );
};

export const getExternalCosigner = async (
  signer: string
): Promise<ExternalCosigner | undefined> => {
  const result = await idb.oneOrNone(
    `
      SELECT
        cosigners.signer,
        cosigners.endpoint,
        cosigners.api_key
      FROM cosigners
      WHERE cosigners.signer = $/signer/
    `,
    {
      signer: toBuffer(signer),
    }
  );
  if (!result) {
    return undefined;
  }

  return {
    signer,
    endpoint: result.endpoint,
    apiKey: result.api_key,
  };
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const signTypedData = async (signer: string, typedData: any) => {
  const externalCosigner = await getExternalCosigner(signer);
  if (!externalCosigner) {
    throw new Error("External cosigner doesn't exist");
  }

  const response = await axios
    .post(
      `${externalCosigner.endpoint}/eth/cosign`,
      {
        cosigner: signer,
        method: "eth_signTypedData_v4",
        params: [typedData],
      },
      {
        headers: {
          "x-api-key": externalCosigner.apiKey,
        },
      }
    )
    .then(({ data }) => data as CosignResponse);

  return response.signature;
};

export class ExternalTypedDataSigner {
  public externalCosigner: ExternalCosigner;

  constructor(_externalCosigner: ExternalCosigner) {
    this.externalCosigner = _externalCosigner;
  }

  async _signTypedData(
    domain: TypedDataDomain,
    types: Record<string, Array<TypedDataField>>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    value: Record<string, any>
  ): Promise<string> {
    return signTypedData(this.externalCosigner.signer, {
      domain,
      types,
      message: value,
    });
  }
}
