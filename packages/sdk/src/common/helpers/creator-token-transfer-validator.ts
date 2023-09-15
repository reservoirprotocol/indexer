import { Provider } from "@ethersproject/abstract-provider";
import { Contract } from "@ethersproject/contracts";

import { TxData } from "../../utils";

import CreatorTokenTransferValidatorAbi from "../abis/CreatorTokenTransferValidator.json";

export class CreatorTokenTransferValidator {
  public contract: Contract;

  constructor(provider: Provider, address: string) {
    this.contract = new Contract(address, CreatorTokenTransferValidatorAbi, provider);
  }

  public async isVerifiedEOA(owner: string): Promise<boolean> {
    return this.contract.isVerifiedEOA(owner);
  }

  public verifyTransaction(approver: string, signature: string): TxData {
    const data = this.contract.interface.encodeFunctionData("verifySignature", [signature]);
    return {
      from: approver,
      to: this.contract.address,
      data,
    };
  }
}
