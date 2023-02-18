import { TypedDataSigner } from "@ethersproject/abstract-signer";
import { Addresses, Types } from "..";
import { Complication } from "./complication.interface";
import { ORDER_EIP712_TYPES } from "./constants";
import {
  Interface,
  _TypedDataEncoder,
  joinSignature,
  recoverAddress,
  solidityKeccak256,
  verifyTypedData,
} from "ethers/lib/utils";
import { bn, lc } from "../../utils";
import { OrderParams } from "../order-params";
import { Contract, Signature } from "ethers";
import { Provider } from "@ethersproject/abstract-provider";
import ComplicationV2Abi from "../abis/ComplicationV2.json";
import * as CommonAddresses from "../../common/addresses";

export class ComplicationV2 implements Complication {
  static supportsAddress(address: string): boolean {
    return Object.values(Addresses.ComplicationV2).includes(address);
  }

  public readonly supportsBulkSignatures = true;

  public readonly supportsContractSignatures = true;

  public get domain() {
    return {
      name: "FlowComplication",
      version: "1",
      chainId: this.chainId,
      verifyingContract: this.address,
    };
  }

  public readonly address: string;
  constructor(public readonly chainId: number) {
    this.address = Addresses.ComplicationV2[chainId] || "";
  }

  async sign(
    signer: TypedDataSigner,
    params: Types.InternalOrder
  ): Promise<string> {
    const { type, value, domain } = this.getSignatureData(params);
    const sig = await signer._signTypedData(domain, type, value);

    return sig;
  }

  async verifySignature(
    sig: string,
    params: Types.InternalOrder,
    provider?: Provider
  ): Promise<void> {
    const { type, value, domain } = this.getSignatureData(params);

    try {
      // Remove the `0x` prefix and count bytes not characters
      const actualSignatureLength = (sig.length - 2) / 2;

      // https://github.com/ProjectOpenSea/seaport/blob/4f2210b59aefa119769a154a12e55d9b77ca64eb/reference/lib/ReferenceVerifiers.sol#L126-L133
      const isBulkSignature =
        actualSignatureLength < 837 &&
        actualSignatureLength > 98 &&
        (actualSignatureLength - 67) % 32 < 2;
      if (isBulkSignature) {
        // https://github.com/ProjectOpenSea/seaport/blob/4f2210b59aefa119769a154a12e55d9b77ca64eb/reference/lib/ReferenceVerifiers.sol#L146-L220
        const proofAndSignature = sig;

        const signatureLength = proofAndSignature.length % 2 === 0 ? 130 : 128;
        const signature = proofAndSignature.slice(0, signatureLength + 2);

        const key = bn(
          "0x" +
            proofAndSignature.slice(
              2 + signatureLength,
              2 + signatureLength + 6
            )
        ).toNumber();

        const height = Math.floor(
          (proofAndSignature.length - 2 - signatureLength) / 64
        );

        const proofElements: string[] = [];
        for (let i = 0; i < height; i++) {
          const start = 2 + signatureLength + 6 + i * 64;
          proofElements.push(
            "0x" + proofAndSignature.slice(start, start + 64).padEnd(64, "0")
          );
        }

        let root = _TypedDataEncoder.hashStruct("Order", type, value);
        for (let i = 0; i < proofElements.length; i++) {
          if ((key >> i) % 2 === 0) {
            root = solidityKeccak256(
              ["bytes"],
              [root + proofElements[i].slice(2)]
            );
          } else {
            root = solidityKeccak256(
              ["bytes"],
              [proofElements[i] + root.slice(2)]
            );
          }
        }

        const types = { ...type };
        (types as any).BulkOrder = [
          { name: "tree", type: `Order${`[2]`.repeat(height)}` },
        ];
        const encoder = _TypedDataEncoder.from(types);

        const bulkOrderTypeHash = solidityKeccak256(
          ["string"],
          [encoder.encodeType("BulkOrder")]
        );
        const bulkOrderHash = solidityKeccak256(
          ["bytes"],
          [bulkOrderTypeHash + root.slice(2)]
        );

        const result = solidityKeccak256(
          ["bytes"],
          [
            "0x1901" +
              _TypedDataEncoder.hashDomain(domain).slice(2) +
              bulkOrderHash.slice(2),
          ]
        );

        const signer = recoverAddress(result, signature);
        if (lc(params.signer) !== lc(signer)) {
          throw new Error("Invalid signature");
        }
      } else {
        const signer = verifyTypedData(domain, type, value, sig);
        if (lc(params.signer) !== lc(signer)) {
          throw new Error("Invalid signature");
        }
      }
    } catch (err) {
      if (!provider) {
        throw new Error("Invalid signature");
      }

      /**
       * check if the signature is a contract signature
       */
      const eip712Hash = _TypedDataEncoder.hash(domain, type, value);

      const iface = new Interface([
        "function isValidSignature(bytes32 digest, bytes signature) view returns (bytes4)",
      ]);

      const result = await new Contract(
        params.signer,
        iface,
        provider
      ).isValidSignature(eip712Hash, sig);
      if (result !== iface.getSighash("isValidSignature")) {
        throw new Error("Invalid signature");
      }
    }
  }

  getSignatureData(params: Types.InternalOrder): Types.SignatureData {
    return {
      signatureKind: "eip712",
      domain: this.domain,
      type: ORDER_EIP712_TYPES,
      value: params,
    };
  }

  joinSignature(sig: Signature | { v: number; r: string; s: string }): string {
    return joinSignature(sig);
  }

  async checkFillability(
    provider: Provider,
    order: OrderParams
  ): Promise<void> {
    const complication = new Contract(
      this.address,
      ComplicationV2Abi,
      provider
    );

    if (order.currency !== CommonAddresses.Eth[this.chainId]) {
      const isCurrencyValid = await complication.isValidCurrency(
        order.currency
      );
      if (!isCurrencyValid) {
        throw new Error("not-fillable");
      }
    }
  }

  checkBaseValid() {
    if (!this.address) {
      throw new Error("Invalid chainId for complication");
    }
  }
}
