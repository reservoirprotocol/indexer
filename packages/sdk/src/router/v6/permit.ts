import { Interface } from "@ethersproject/abi";
import { Provider } from "@ethersproject/abstract-provider";
import { BigNumberish } from "@ethersproject/bignumber";
import { splitSignature } from "@ethersproject/bytes";
import { Contract } from "@ethersproject/contracts";
import { verifyTypedData } from "@ethersproject/wallet";

import { TxData, bn, getCurrentTimestamp } from "../../utils";
import * as Addresses from "./addresses";
import * as ApprovalProxy from "./approval-proxy";

import PermitProxyAbi from "./abis/PermitProxy.json";
import RouterAbi from "./abis/ReservoirV6_0_1.json";

export type Transfer = {
  recipient: string;
  amount: BigNumberish;
};

export type PermitWithTransfers = {
  token: string;
  owner: string;
  spender: string;
  amount: BigNumberish;
  deadline: number;
  transfers: Transfer[];
  signature?: string;
};

export class PermitHandler {
  public chainId: number;
  public provider: Provider;

  constructor(chainId: number, provider: Provider) {
    this.chainId = chainId;
    this.provider = provider;
  }

  public async generate(
    owner: string,
    transferItems: ApprovalProxy.TransferItem[],
    expiresIn = 10 * 60
  ): Promise<PermitWithTransfers[]> {
    if (!transferItems.length) {
      return [];
    }

    const currencyToTransferItems: { [currency: string]: ApprovalProxy.TransferItem[] } = {};
    for (const transferItem of transferItems) {
      for (const item of transferItem.items) {
        if (!currencyToTransferItems[item.token]) {
          currencyToTransferItems[item.token] = [];
        }
        currencyToTransferItems[item.token].push(transferItem);
      }
    }

    const currentTime = getCurrentTimestamp();

    const permits: PermitWithTransfers[] = [];
    for (const [currency, transferItems] of Object.entries(currencyToTransferItems)) {
      const totalAmountPerRecipient = transferItems.map((transferItem) => ({
        amount: transferItem.items
          .map((item) => bn(item.amount))
          .reduce((a, b) => a.add(b))
          .toString(),
        recipient: transferItem.recipient,
      }));

      permits.push({
        token: currency,
        owner,
        spender: Addresses.PermitProxy[this.chainId],
        amount: totalAmountPerRecipient
          .map(({ amount }) => bn(amount))
          .reduce((a, b) => a.add(b))
          .toString(),
        deadline: currentTime + expiresIn,
        transfers: totalAmountPerRecipient,
      });
    }

    return permits;
  }

  public async getSignatureData(permit: PermitWithTransfers) {
    const tokenContract = new Contract(
      permit.token,
      new Interface([
        `function nonces(address owner) external view returns (uint256)`,
        `function name() external view returns(string)`,
        `function version() external view returns(string)`,
      ]),
      this.provider
    );
    const [nonce, name, version] = await Promise.all([
      tokenContract.nonces(permit.owner),
      tokenContract.name(),
      tokenContract.version(),
    ]);

    return {
      signatureKind: "eip712",
      domain: {
        name,
        version,
        chainId: this.chainId,
        verifyingContract: permit.token,
      },
      types: {
        Permit: [
          { name: "owner", type: "address" },
          { name: "spender", type: "address" },
          { name: "value", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      },
      value: {
        owner: permit.owner,
        spender: Addresses.PermitProxy[this.chainId],
        value: permit.amount.toString(),
        nonce: nonce.toString(),
        deadline: permit.deadline,
      },
    };
  }

  public async attachAndCheckSignature(permit: PermitWithTransfers, signature: string) {
    const signatureData = await this.getSignatureData(permit);
    const signer = verifyTypedData(
      signatureData.domain,
      signatureData.types,
      signatureData.value,
      signature
    );

    if (signer.toLowerCase() != permit.owner.toLowerCase()) {
      throw new Error("Invalid signature");
    }

    permit.signature = signature;
  }

  public attachToRouterExecution(txData: TxData, permits: PermitWithTransfers[]): TxData {
    // Handle the case when there's no permits to attach
    if (!permits.length) {
      return txData;
    }

    const executionInfos = new Interface(RouterAbi).decodeFunctionData(
      "execute",
      txData.data
    ).executionInfos;

    return {
      ...txData,
      to: Addresses.PermitProxy[this.chainId],
      data: new Interface(PermitProxyAbi).encodeFunctionData("transferWithExecute", [
        permits.map((p) => ({
          ...p,
          ...splitSignature(p.signature!),
        })),
        executionInfos,
      ]),
    };
  }
}
