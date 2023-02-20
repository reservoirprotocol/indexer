import { Interface } from "@ethersproject/abi";
import { Provider } from "@ethersproject/abstract-provider";
import { Contract } from "@ethersproject/contracts";
import { verifyTypedData } from "@ethersproject/wallet";
import {
  AllowanceTransfer,
  PermitBatch,
  PermitDetails,
} from "@uniswap/permit2-sdk";

import * as Sdk from "../../../index";
import { TxData, bn, getCurrentTimestamp } from "../../../utils";

import Permit2Abi from "../../../common/abis/Permit2.json";
import RouterAbi from "../abis/ReservoirV6_0_0.json";
import Permit2ModuleAbi from "../abis/Permit2Module.json";

export type TransferDetail = {
  from: string;
  to: string;
  token: string;
  amount: string;
};

export type Data = {
  owner: string;
  permitBatch: PermitBatch;
  transferDetails: TransferDetail[];
  signature?: string;
};

export class Handler {
  public chainId: number;
  public provider: Provider;

  public permit2Contract: Contract;

  constructor(chainId: number, provider: Provider) {
    this.chainId = chainId;
    this.provider = provider;
    this.permit2Contract = new Contract(
      Sdk.Common.Addresses.Permit2[this.chainId],
      Permit2Abi,
      provider
    );
  }

  public async generate(
    transferDetails: TransferDetail[],
    expiresIn = 10 * 60
  ): Promise<Data> {
    if (!transferDetails.length) {
      throw new Error("Empty permit");
    }

    const owner = transferDetails[0].from.toLowerCase();
    if (!transferDetails.every(({ from }) => from.toLowerCase() === owner)) {
      throw new Error("Different owners");
    }

    const now = getCurrentTimestamp();

    const rawDetails: PermitDetails[] = [];
    await Promise.all(
      transferDetails.map(async ({ from, token, amount }) => {
        const packedAllowance = await this.permit2Contract.allowance(
          from,
          token,
          Sdk.RouterV6.Addresses.Permit2Module[this.chainId]
        );
        rawDetails.push({
          token: token,
          amount,
          expiration: now + expiresIn,
          nonce: packedAllowance.nonce,
        });
      })
    );

    // Aggregate same token permits
    const finalDetails: PermitDetails[] = [];
    for (let i = 0; i < rawDetails.length; i++) {
      const detail = rawDetails[i];
      const existingPermit = finalDetails.find((_) => _.token === detail.token);
      if (!existingPermit) {
        finalDetails.push(detail);
      } else {
        existingPermit.amount = bn(existingPermit.amount)
          .add(bn(detail.amount))
          .toString();
      }
    }

    const permitBatch = {
      details: finalDetails,
      spender: Sdk.RouterV6.Addresses.Permit2Module[this.chainId],
      sigDeadline: now + expiresIn,
    };

    return {
      owner,
      permitBatch,
      transferDetails,
    };
  }

  public getSignatureData(permit2Approval: Data) {
    const signatureData = AllowanceTransfer.getPermitData(
      permit2Approval.permitBatch,
      Sdk.Common.Addresses.Permit2[this.chainId],
      this.chainId
    );
    return {
      signatureKind: "eip712",
      domain: signatureData.domain,
      types: signatureData.types,
      value: signatureData.values,
    };
  }

  public attachAndCheckSignature(permit2Approval: Data, signature: string) {
    const signatureData = this.getSignatureData(permit2Approval);
    const signer = verifyTypedData(
      signatureData.domain,
      signatureData.types,
      signatureData.value,
      signature
    );

    if (signer.toLowerCase() != permit2Approval.owner.toLowerCase()) {
      throw new Error("Invalid signature");
    }

    permit2Approval.signature = signature;
  }

  public attachToRouterExecution(txData: TxData, data: Data[]): TxData {
    // Handle the case when there's no permits to attach
    if (!data.length) {
      return txData;
    }

    const routerIface = new Interface(RouterAbi);
    const executionInfos = routerIface.decodeFunctionData(
      "execute",
      txData.data
    ).executionInfos;

    const permit2ModuleIface = new Interface(Permit2ModuleAbi);
    return {
      ...txData,
      data: routerIface.encodeFunctionData("execute", [
        [
          ...data.map(({ owner, permitBatch, transferDetails, signature }) => {
            return {
              module: Sdk.RouterV6.Addresses.Permit2Module[this.chainId],
              data: permit2ModuleIface.encodeFunctionData("permitTransfer", [
                owner,
                permitBatch,
                transferDetails,
                signature,
              ]),
              value: 0,
            };
          }),
          ...executionInfos,
        ],
      ]),
    };
  }
}
