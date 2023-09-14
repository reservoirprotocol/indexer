import { Contract } from "@ethersproject/contracts";
import * as Addresses from "./addresses";
import ConduitControllerAbi from "./abis/ConduitController.json";
import { keccak256 as solidityKeccak256 } from "@ethersproject/solidity";

export class ConduitController {
  public chainId: number;
  public contract: Contract;

  constructor(chainId: number) {
    this.chainId = chainId;
    this.contract = new Contract(Addresses.ConduitController[this.chainId], ConduitControllerAbi);
  }

  public deriveConduit(conduitKey: string) {
    return (
      "0x" +
      solidityKeccak256(
        ["bytes1", "address", "bytes32", "bytes32"],
        [
          "0xff",
          Addresses.ConduitController[this.chainId],
          conduitKey,
          Addresses.ConduitControllerCodeHash[this.chainId],
        ]
      ).slice(-40)
    );
  }
}
