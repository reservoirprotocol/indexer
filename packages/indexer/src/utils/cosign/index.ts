import { Wallet } from "@ethersproject/wallet";

import { config } from "@/config/index";

export function getCosigner() {
  return new Wallet(config.cosignerPrivateKey);
}
