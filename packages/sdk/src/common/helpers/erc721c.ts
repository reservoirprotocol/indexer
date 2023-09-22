import { Interface } from "@ethersproject/abi";

import { TxData } from "../../utils";

export class ERC721C {
  public generateVerificationTxData(
    transferValidator: string,
    address: string,
    signature: string
  ): TxData {
    const iface = new Interface(["function verifySignature(bytes signature)"]);
    return {
      from: address,
      to: transferValidator,
      data: iface.encodeFunctionData("verifySignature", [signature]),
    };
  }
}
