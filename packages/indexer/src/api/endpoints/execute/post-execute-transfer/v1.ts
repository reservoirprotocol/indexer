import { Request, RouteOptions } from "@hapi/hapi";
import * as Sdk from "@reservoir0x/sdk";
import * as ApprovalProxy from "@reservoir0x/sdk/dist/router/v6/approval-proxy";
import Joi from "joi";

import { logger } from "@/common/logger";
import { baseProvider } from "@/common/provider";
import { regex } from "@/common/utils";
import { config } from "@/config/index";
import * as commonHelpers from "@/orderbook/orders/common/helpers";

const version = "v1";

export const postExecuteTransferV1Options: RouteOptions = {
  description: "Transfer Tokens",
  notes: "Use this endpoint to bulk transfer an array of NFTs.",
  tags: ["api"],
  plugins: {
    "hapi-swagger": {
      order: 50,
    },
  },
  validate: {
    payload: Joi.object({
      from: Joi.string().required(),
      to: Joi.string().required(),
      items: Joi.array()
        .items(
          Joi.object({
            token: Joi.string().pattern(regex.token).required(),
            quantity: Joi.number().min(1).default(1),
          })
        )
        .min(1),
    }),
  },
  response: {
    schema: Joi.object({
      steps: Joi.array().items(
        Joi.object({
          id: Joi.string().required().description("Returns `nft-approval` or `transfer`"),
          kind: Joi.string().valid("transaction").required().description("Returns `transaction`"),
          action: Joi.string().required(),
          description: Joi.string().required(),
          items: Joi.array()
            .items(
              Joi.object({
                status: Joi.string()
                  .valid("complete", "incomplete")
                  .required()
                  .description("Returns `complete` or `incomplete`."),
                data: Joi.object(),
              })
            )
            .required(),
        })
      ),
    }).label(`postExecuteTransfer${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(`post-execute-transfer-${version}-handler`, `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payload = request.payload as any;

    try {
      const transferItem: ApprovalProxy.TransferItem = {
        items: await Promise.all(
          payload.items.map(async (item: { token: string; quantity: number }) => ({
            itemType:
              (await commonHelpers.getContractKind(item.token.split(":")[0])) === "erc1155"
                ? ApprovalProxy.ItemType.ERC1155
                : ApprovalProxy.ItemType.ERC721,
            token: item.token.split(":")[0],
            identifier: item.token.split(":")[1],
            amount: item.quantity,
          }))
        ),
        recipient: payload.to,
      };

      const steps: {
        id: string;
        action: string;
        description: string;
        kind: string;
        items: {
          status: string;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          data?: any;
        }[];
      }[] = [
        {
          id: "nft-approval",
          action: "Approve NFT contracts",
          description:
            "Each NFT collection you want to transfer requires a one-time approval transaction",
          kind: "transaction",
          items: [],
        },
        {
          id: "transfer",
          action: "Authorize transfer",
          description: "Transfer the items",
          kind: "transaction",
          items: [],
        },
      ];

      const router = new Sdk.RouterV6.Router(config.chainId, baseProvider);
      const { txs } = await router.transfersTx(transferItem, payload.from);

      const approvals = txs.map((tx) => tx.approvals).flat();
      for (const approval of approvals) {
        const isApproved = await commonHelpers.getNftApproval(
          approval.contract,
          approval.owner,
          approval.operator
        );
        if (!isApproved) {
          steps[0].items.push({
            status: "incomplete",
            data: approval.txData,
          });
        }
      }

      for (const { txData } of txs) {
        steps[1].items.push({
          status: "incomplete",
          data: txData,
        });
      }

      return { steps };
    } catch (error) {
      logger.error(`post-execute-transfer-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
