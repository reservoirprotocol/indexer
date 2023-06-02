import { Interface } from "@ethersproject/abi";
import { Contract } from "@ethersproject/contracts";
import { AlchemyProvider } from "@ethersproject/providers";
import { Wallet } from "@ethersproject/wallet";
import * as Sdk from "@reservoir0x/sdk";
import axios from "axios";
import cron from "node-cron";

import { logger } from "@/common/logger";
import { redlock } from "@/common/redis";
import { config } from "@/config/index";

// MASTER ONLY
if (
  config.doBackgroundWork &&
  config.master &&
  config.chainId === 5 &&
  config.environment === "dev"
) {
  // Publish new prices to data feeds every hour
  cron.schedule(
    "0 0 */1 * * *",
    async () =>
      await redlock
        .acquire(["oracle-price-publish"], (3600 - 60) * 1000)
        .then(async () => {
          try {
            // Ideally every indexer should only publish prices to the chain it's
            // running on. However, for testing purposes we make an exception and
            // relay prices to a different network.

            // Test data feeds: "BAYC / USDC", "CHIMP / USDC"
            const dataFeeds = [
              {
                collection: "0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d",
                feed: "0xC5B29989e47bb0a17B0870b027BE26522d654BF5",
              },
              {
                collection: "0x80336ad7a747236ef41f47ed2c7641828a480baa",
                feed: "0x8fF91c16a42c45D20F4A0806afb5ab9C9112f472",
              },
            ];

            const provider = new AlchemyProvider("kovan");
            for (const { collection, feed } of dataFeeds) {
              const iface = new Interface([
                {
                  inputs: [
                    {
                      components: [
                        {
                          internalType: "bytes32",
                          name: "id",
                          type: "bytes32",
                        },
                        {
                          internalType: "bytes",
                          name: "payload",
                          type: "bytes",
                        },
                        {
                          internalType: "uint256",
                          name: "timestamp",
                          type: "uint256",
                        },
                        {
                          internalType: "bytes",
                          name: "signature",
                          type: "bytes",
                        },
                      ],
                      name: "message",
                      type: "tuple",
                    },
                  ],
                  name: "recordPrice",
                  outputs: [],
                  stateMutability: "nonpayable",
                  type: "function",
                },
              ]);
              const contract = new Contract(feed, iface, provider);

              if (config.oraclePrivateKey) {
                // Fetch the oracle message
                const message = await axios
                  .get(
                    `https://api.reservoir.tools/oracle/collections/${collection}/floor-ask/v1?kind=twap&currency=${Sdk.Common.Addresses.Usdc[42]}`
                  )
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  .then((response) => (response.data as any).message);

                logger.info("oracle-price-publish", JSON.stringify(message));

                // Wait for 1 minute to make sure on-chain validation passes
                await new Promise((resolve) => setTimeout(resolve, 60 * 1000));

                // Publish the price
                const tx = await contract
                  .connect(new Wallet(config.oraclePrivateKey).connect(provider))
                  .recordPrice(message);
                const txReceipt = await tx.wait();

                logger.info(
                  "oracle-price-publish",
                  `Relayed price publish transaction: ${txReceipt.transactionHash}`
                );
              } else {
                logger.info("oracle-price-publish", "Skipped publishing prices");
              }
            }
          } catch (error) {
            logger.error("oracle-price-publish", `Failed to publish new prices: ${error}`);
          }
        })
        .catch(() => {
          // Skip on any errors
        })
  );
}
