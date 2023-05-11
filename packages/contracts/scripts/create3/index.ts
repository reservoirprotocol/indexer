/* eslint-disable no-console */

import { JsonRpcProvider } from "@ethersproject/providers";

import { triggerByModule } from "./deploy";

const main = async () => {
  const provider = new JsonRpcProvider(process.env.RPC_URL!);
  const chainId = await provider.getNetwork().then((n) => n.chainId);

  for (const deploy of Object.values(triggerByModule)) {
    await deploy(chainId);
  }
};

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
