import axios from "axios";
import { gql, request } from "graphql-request";

import * as v001 from "@/arweave-sync/common/v001";
import { arweaveGateway } from "@/common/provider";
import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { getNetworkName } from "@/common/utils";

type Transaction = {
  version: string;
  id: string;
};

type ArweaveSyncResult = {
  lastBlock?: number;
  lastCursor?: string;
  done: boolean;
  transactions: Transaction[];
};

export const syncArweave = async (options: {
  fromBlock?: number;
  toBlock?: number;
  afterCursor?: string;
  pending?: boolean;
}): Promise<ArweaveSyncResult> => {
  const transactions: Transaction[] = [];

  const batchSize = 100;

  // https://gist.github.com/TheLoneRonin/08d9fe4a43486815c78d6bebb2da4fff
  const { fromBlock, toBlock, afterCursor, pending } = options;
  const query = gql`
    {
      transactions(
        tags: [
          { name: "App-Name", values: ["Reservoir Protocol"] },
          { name: "Network", values: ["${getNetworkName()}"] }
        ]
        first: ${batchSize}
        sort: ${pending ? "HEIGHT_DESC" : "HEIGHT_ASC"}
        ${
          fromBlock && toBlock
            ? `block: { min: ${fromBlock}, max: ${toBlock} }`
            : fromBlock
            ? `block: { min: ${fromBlock} }`
            : toBlock
            ? `block: { max: ${toBlock} }`
            : ""
        }
        ${afterCursor ? `after: "${afterCursor}"` : ""}
      ) {
        edges {
          cursor
          node {
            id
            tags {
              name
              value
            }
            block {
              height
            }
          }
        }
      }
    }
  `;

  const { protocol, host } = arweaveGateway.api.config;
  const data = await request(`${protocol}://${host}/graphql`, query);

  const results: {
    cursor: string;
    node: {
      id: string;
      tags: {
        name: string;
        value: string;
      }[];
      block: {
        height: number;
      };
    };
  }[] = data?.transactions?.edges ?? [];

  let lastBlock: number | undefined;
  if (results.length) {
    lastBlock = results[results.length - 1].node.block.height;
  }

  let lastCursor: string | undefined;
  if (results.length) {
    lastCursor = results[results.length - 1].cursor;
  }

  for (const { node } of results) {
    // https://discordapp.com/channels/357957786904166400/358038065974870018/940653379133272134
    if (pending && node.block) {
      break;
    }

    const transactionCache = await redis.get(`arweave-transaction-${node.id}`);
    if (transactionCache) {
      // Skip if we already processed this particular transaction
      continue;
    } else {
      if (pending) {
        logger.info("sync-arweave", `Got pending transaction ${node.id}`);
      }

      // Optimistically cache the pending transaction as processed
      await redis.set(`arweave-transaction-${node.id}`, "1", "EX", 3600);
    }

    try {
      const version = node.tags.find((t) => t.name === "App-Version")?.value;
      if (!version) {
        // Skip unversioned transactions
        continue;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let data: any;
      if (pending) {
        // https://discordapp.com/channels/357957786904166400/358038065974870018/945399371426582579
        const result = await axios.get(`${protocol}://${host}/${node.id}`, {
          timeout: 60000,
        });
        data = result.data;
      } else {
        data = JSON.parse(
          (await arweaveGateway.transactions.getData(node.id, {
            decode: true,
            string: true,
          })) as string
        );
      }

      switch (version) {
        case "0.0.1": {
          await v001.processTransactionData(data);
          break;
        }

        default: {
          logger.info("sync-arweave", `Unrecognized version ${version}`);
          break;
        }
      }
    } catch (error) {
      // Ignore any errors
      logger.error("sync-arweave", `Failed to handle transaction ${node.id}: ${error}`);
    }
  }

  return {
    lastBlock,
    lastCursor,
    done: results.length < batchSize,
    transactions,
  };
};
