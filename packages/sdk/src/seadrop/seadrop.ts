import { Provider } from "@ethersproject/abstract-provider";
import { Contract } from "@ethersproject/contracts";

import SeadropAbi from "./abis/Seadrop.json";

export class Seadrop {
  public chainId: number;

  constructor(chainId: number) {
    this.chainId = chainId;
  }

  public async getPublicDrop(address: string, provider: Provider) {
    const contract = new Contract(address, SeadropAbi, provider);
    const result = await contract.getPublicDrop(address);

    const mintPrice = result.mintPrice.toString() as string;
    const startTime = result.startTime.toNumber() as number;
    const endTime = result.endTime.toNumber() as number;
    const maxTotalMintableByWallet = result.maxTotalMintableByWallet.toString() as string;
    const feeBps = result.feeBps.toNumber() as number;
    const restrictFeeRecipients = result.restrictFeeRecipients as boolean;

    if (startTime === 0 && endTime === 0) {
      throw new Error("Not available");
    }

    return {
      mintPrice,
      startTime,
      endTime,
      maxTotalMintableByWallet,
      feeBps,
      restrictFeeRecipients,
    };
  }
}
