import { Interface } from "@ethersproject/abi";
import { Provider } from "@ethersproject/abstract-provider";
import { BigNumberish } from "@ethersproject/bignumber";
import { hexZeroPad, splitSignature } from "@ethersproject/bytes";
import { Contract } from "@ethersproject/contracts";
import { _TypedDataEncoder } from "@ethersproject/hash";
import { verifyTypedData } from "@ethersproject/wallet";

import * as CommonAddresses from "../../common/addresses";
import { Network, TxData, bn, getCurrentTimestamp } from "../../utils";
import * as Addresses from "./addresses";
import * as ApprovalProxy from "./approval-proxy";
import { ExecutionInfo } from "./types";

import PermitProxyAbi from "./abis/PermitProxy.json";
import RouterAbi from "./abis/ReservoirV6_0_1.json";

export type Transfer = {
  recipient: string;
  amount: BigNumberish;
};

export type PermitKind = "eip2612";

export type Permit = {
  kind: PermitKind;
  data: EIP2612PermitWithTransfers;
};

export type EIP2612PermitWithTransfers = {
  owner: string;
  spender: string;
  token: string;
  amount: string;
  nonce: string;
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

  public async getNonce(token: string, owner: string): Promise<string> {
    const tokenContract = new Contract(
      token,
      new Interface(["function nonces(address owner) external view returns (uint256)"]),
      this.provider
    );

    const nonce = await tokenContract.nonces(owner);
    return nonce.toString();
  }

  public async generate(
    owner: string,
    spender: string,
    options:
      | {
          // Generate the permit given a list of required transfers
          kind: "with-transfers";
          transferItems: ApprovalProxy.TransferItem[];
        }
      | {
          // Generate the permit directly without any associated transfers
          kind: "no-transfers";
          token: string;
          amount: string;
        },
    expiresIn = 10 * 60
  ): Promise<Permit[]> {
    const currentTime = getCurrentTimestamp();

    if (options.kind === "with-transfers") {
      if (!options.transferItems.length) {
        return [];
      }

      const currencyToTransferItems: { [currency: string]: ApprovalProxy.TransferItem[] } = {};
      for (const transferItem of options.transferItems) {
        for (const item of transferItem.items) {
          if (!currencyToTransferItems[item.token]) {
            currencyToTransferItems[item.token] = [];
          }
          currencyToTransferItems[item.token].push(transferItem);
        }
      }

      const permits: EIP2612PermitWithTransfers[] = [];
      for (const [currency, transferItems] of Object.entries(currencyToTransferItems)) {
        const totalAmountPerRecipient = transferItems.map((transferItem) => ({
          amount: transferItem.items
            .map((item) => bn(item.amount))
            .reduce((a, b) => a.add(b))
            .toString(),
          recipient: transferItem.recipient,
        }));

        permits.push({
          owner,
          spender,
          token: currency,
          amount: totalAmountPerRecipient
            .map(({ amount }) => bn(amount))
            .reduce((a, b) => a.add(b))
            .toString(),
          deadline: currentTime + expiresIn,
          nonce: await this.getNonce(currency, owner),
          transfers: totalAmountPerRecipient,
        });
      }

      return permits.map((p) => ({
        kind: "eip2612",
        data: p,
      }));
    } else {
      const permits = [
        {
          owner,
          spender,
          token: options.token,
          amount: options.amount,
          deadline: currentTime + expiresIn,
          nonce: await this.getNonce(options.token, owner),
          transfers: [],
        },
      ];

      return permits.map((p) => ({
        kind: "eip2612",
        data: p,
      }));
    }
  }

  public async hash(permit: Permit) {
    return _TypedDataEncoder.hashStruct("Permit", EIP712_TYPES_FOR_EIP2612_PERMIT, {
      owner: permit.data.owner,
      spender: permit.data.spender,
      value: permit.data.amount,
      nonce: permit.data.nonce,
      deadline: permit.data.deadline,
    });
  }

  public async getSignatureData(permit: Permit) {
    const tokenContract = new Contract(
      permit.data.token,
      new Interface([
        "function name() external view returns (string)",
        "function version() external view returns (string)",
        "function EIP712_VERSION() external view returns (string)",
      ]),
      this.provider
    );
    const [name, version] = await Promise.all([
      tokenContract.name(),
      tokenContract.version().catch(() => tokenContract.EIP712_VERSION()),
    ]);

    return {
      signatureKind: "eip712",
      domain:
        // The bridged USDC on Polygon and Mumbai have a custom domain
        [Network.Polygon, Network.Mumbai].includes(this.chainId) &&
        permit.data.token === CommonAddresses.Usdc[this.chainId][0]
          ? {
              name,
              version,
              salt: hexZeroPad(bn(this.chainId).toHexString(), 32),
              verifyingContract: permit.data.token,
            }
          : {
              name,
              version,
              chainId: this.chainId,
              verifyingContract: permit.data.token,
            },
      types: EIP712_TYPES_FOR_EIP2612_PERMIT,
      value: {
        owner: permit.data.owner,
        spender: permit.data.spender,
        value: permit.data.amount,
        nonce: permit.data.nonce,
        deadline: permit.data.deadline,
      },
    };
  }

  public async attachAndCheckSignature(permit: Permit, signature: string) {
    const signatureData = await this.getSignatureData(permit);
    const signer = verifyTypedData(
      signatureData.domain,
      signatureData.types,
      signatureData.value,
      signature
    );

    if (signer.toLowerCase() != permit.data.owner.toLowerCase()) {
      throw new Error("Invalid signature");
    }

    permit.data.signature = signature;
  }

  // For plain permits
  public getRouterExecution(permits: Permit[]): ExecutionInfo {
    if (!permits.every((p) => p.data.transfers.length === 0)) {
      throw new Error("Transfer permits not supported");
    }

    return {
      module: Addresses.PermitProxy[this.chainId],
      data: new Interface(PermitProxyAbi).encodeFunctionData("eip2612Permit", [
        permits.map((p) => ({
          ...p.data,
          ...splitSignature(p.data.signature!),
        })),
      ]),
      value: 0,
    };
  }

  // For transfer permits
  public attachToRouterExecution(txData: TxData, permits: Permit[]): TxData {
    if (!permits.every((p) => p.data.transfers.length > 0)) {
      throw new Error("Non-transfer permits not supported");
    }

    // Handle the case when there's no permits to attach
    if (!permits.length) {
      return txData;
    }

    return {
      ...txData,
      to: Addresses.PermitProxy[this.chainId],
      data: new Interface(PermitProxyAbi).encodeFunctionData(
        "eip2612PermitWithTransfersAndExecute",
        [
          permits.map((p) => ({
            permit: {
              ...p.data,
              ...splitSignature(p.data.signature!),
            },
            transfers: p.data.transfers,
          })),
          new Interface(RouterAbi).decodeFunctionData("execute", txData.data).executionInfos,
        ]
      ),
    };
  }
}

const EIP712_TYPES_FOR_EIP2612_PERMIT = {
  Permit: [
    { name: "owner", type: "address" },
    { name: "spender", type: "address" },
    { name: "value", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
};
