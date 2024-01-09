import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();

import { jest, describe, it, expect } from "@jest/globals";
import * as externalCosign from "@/utils/offchain-cancel/external-cosign";
import { verifyTypedData } from "@ethersproject/wallet";

jest.setTimeout(1000 * 1000);

describe("External Cosign", () => {
  it("cosignkey", async () => {
    const operatorKey = "test";
    const operatorKey2 = "test2";

    const cosigner = String(process.env.COSIGNER);
    const cosignAPIKey = "test";
    const externalCosigKey = {
      signer: cosigner,
      endpoint: "http://localhost:8082",
      apiKey: cosignAPIKey,
    };
    await externalCosign.upsertExternalCosignKey(externalCosigKey, operatorKey);
    let verifyCatched = false;
    try {
      await externalCosign.upsertExternalCosignKey(
        {
          ...externalCosigKey,
        },
        operatorKey2
      );
    } catch {
      verifyCatched = true;
    }

    const externalCosigKeyDb = await externalCosign.getExternalCosignKey(cosigner);
    const typedData = {
      domain: {
        name: "PaymentProcessor",
        version: "2",
        chainId: 11155111,
        verifyingContract: "0x6abe007ac55e8f7b3b2744814af04b843809871c",
      },
      types: {
        SaleApproval: [
          { name: "protocol", type: "uint8" },
          { name: "cosigner", type: "address" },
          { name: "seller", type: "address" },
          { name: "marketplace", type: "address" },
          { name: "fallbackRoyaltyRecipient", type: "address" },
          { name: "paymentMethod", type: "address" },
          { name: "tokenAddress", type: "address" },
          { name: "tokenId", type: "uint256" },
          { name: "amount", type: "uint256" },
          { name: "itemPrice", type: "uint256" },
          { name: "expiration", type: "uint256" },
          { name: "marketplaceFeeNumerator", type: "uint256" },
          { name: "maxRoyaltyFeeNumerator", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "masterNonce", type: "uint256" },
        ],
      },
      message: {
        protocol: 0,
        cosigner: "0x0000000000000000000000000000000000000000",
        seller: "0xe194be586919965a187d9aab28a92f6c1f0293dc",
        marketplace: "0x0000000000000000000000000000000000000000",
        fallbackRoyaltyRecipient: "0x0000000000000000000000000000000000000000",
        paymentMethod: "0x0000000000000000000000000000000000000000",
        tokenAddress: "0x5d2ab1f930ce63778ce0ae81bd01142435aef35b",
        tokenId: "1",
        amount: "1",
        itemPrice: "1000000000000000000",
        expiration: "1704285606",
        marketplaceFeeNumerator: "0",
        maxRoyaltyFeeNumerator: "0",
        nonce: "1063371009440821441053095",
        masterNonce: "0",
      },
    };
    const signature = await externalCosign.signTypedDataWithCosign(cosigner, typedData);
    const recoveredSigner = verifyTypedData(
      typedData.domain,
      typedData.types,
      typedData.message,
      signature
    );

    const externalCosigner = new externalCosign.ExternalTypedDataSigner(externalCosigKeyDb!);
    const signature2 = await externalCosigner._signTypedData(
      typedData.domain,
      typedData.types,
      typedData.message
    );

    // Check wrapped TypedDataSigner's signature is same as the low-level call
    expect(signature2).toBe(signature);

    // Check external service signature is correct
    expect(recoveredSigner.toLowerCase()).toBe(cosigner.toLowerCase());

    // Update with different api key should be failed
    expect(verifyCatched).toBe(true);

    // Signer in database should match with the config
    expect(externalCosigKeyDb?.signer).toBe(cosigner);
  });
});
