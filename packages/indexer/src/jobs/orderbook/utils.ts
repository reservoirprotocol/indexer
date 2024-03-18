import { logger } from "@/common/logger";
import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import * as orders from "@/orderbook/orders";

type CommonOrderInfo = {
  delayBeforeProcessing?: number;
  validateBidValue?: boolean;
  ingestMethod?: "websocket" | "rest";
  ingestDelay?: number;
};

export type GenericOrderInfo =
  | ({
      kind: "zeroex-v4";
      info: orders.zeroExV4.OrderInfo;
    } & CommonOrderInfo)
  | ({
      kind: "foundation";
      info: orders.foundation.OrderInfo;
    } & CommonOrderInfo)
  | ({
      kind: "x2y2";
      info: orders.x2y2.OrderInfo;
    } & CommonOrderInfo)
  | ({
      kind: "seaport";
      info: orders.seaport.OrderInfo;
    } & CommonOrderInfo)
  | ({
      kind: "seaport-v1.4";
      info: orders.seaportV14.OrderInfo;
    } & CommonOrderInfo)
  | ({
      kind: "seaport-v1.5";
      info: orders.seaportV15.OrderInfo;
    } & CommonOrderInfo)
  | ({
      kind: "cryptopunks";
      info: orders.cryptopunks.OrderInfo;
    } & CommonOrderInfo)
  | ({
      kind: "zora-v3";
      info: orders.zora.OrderInfo;
    } & CommonOrderInfo)
  | ({
      kind: "sudoswap";
      info: orders.sudoswap.OrderInfo;
    } & CommonOrderInfo)
  | ({
      kind: "rarible";
      info: orders.rarible.OrderInfo;
    } & CommonOrderInfo)
  | ({
      kind: "blur-listing";
      info: orders.blur.PartialListingOrderInfo;
    } & CommonOrderInfo)
  | ({
      kind: "blur-bid";
      info: orders.blur.PartialBidOrderInfo;
    } & CommonOrderInfo)
  | ({
      kind: "manifold";
      info: orders.manifold.OrderInfo;
    } & CommonOrderInfo)
  | ({
      kind: "element";
      info: orders.element.OrderInfo;
    } & CommonOrderInfo)
  | ({
      kind: "nftx";
      info: orders.nftx.OrderInfo;
    } & CommonOrderInfo)
  | ({
      kind: "nftx-v3";
      info: orders.nftxV3.OrderInfo;
    } & CommonOrderInfo)
  | ({
      kind: "superrare";
      info: orders.superrare.OrderInfo;
    } & CommonOrderInfo)
  | ({
      kind: "looks-rare-v2";
      info: orders.looksRareV2.OrderInfo;
    } & CommonOrderInfo)
  | ({
      kind: "sudoswap-v2";
      info: orders.sudoswapV2.OrderInfo;
    } & CommonOrderInfo)
  | ({
      kind: "caviar-v1";
      info: orders.caviarV1.OrderInfo;
    } & CommonOrderInfo);

export const processOrder = async (job: AbstractRabbitMqJobHandler, payload: GenericOrderInfo) => {
  const { kind, info, validateBidValue, ingestMethod, ingestDelay } = payload;

  let result: { status: string; delay?: number }[] = [];
  try {
    switch (kind) {
      case "x2y2": {
        result = await orders.x2y2.save([info]);
        break;
      }

      case "element": {
        result = await orders.element.save([info]);
        break;
      }

      case "foundation": {
        result = await orders.foundation.save([info]);
        break;
      }

      case "cryptopunks": {
        result = await orders.cryptopunks.save([info]);
        break;
      }

      case "zora-v3": {
        result = await orders.zora.save([info]);
        break;
      }

      case "seaport": {
        result = await orders.seaport.save([info], validateBidValue, ingestMethod);
        break;
      }

      case "seaport-v1.4": {
        result = await orders.seaportV14.save([info], validateBidValue, ingestMethod, ingestDelay);
        break;
      }

      case "seaport-v1.5": {
        result = await orders.seaportV15.save([info], validateBidValue, ingestMethod, ingestDelay);
        break;
      }

      case "sudoswap": {
        result = await orders.sudoswap.save([info]);
        break;
      }

      case "sudoswap-v2": {
        result = await orders.sudoswapV2.save([info]);
        break;
      }

      case "zeroex-v4": {
        result = await orders.zeroExV4.save([info]);
        break;
      }

      case "rarible": {
        result = await orders.rarible.save([info]);
        break;
      }

      case "blur-listing": {
        result = await orders.blur.savePartialListings([info], ingestMethod);
        break;
      }

      case "blur-bid": {
        result = await orders.blur.savePartialBids([info], ingestMethod);
        break;
      }

      case "manifold": {
        result = await orders.manifold.save([info]);
        break;
      }

      case "nftx": {
        result = await orders.nftx.save([info]);
        break;
      }

      case "nftx-v3": {
        result = await orders.nftxV3.save([info]);
        break;
      }

      case "superrare": {
        result = await orders.superrare.save([info]);
        break;
      }

      case "looks-rare-v2": {
        result = await orders.looksRareV2.save([info]);
        break;
      }

      case "caviar-v1": {
        result = await orders.caviarV1.save([info]);
        break;
      }
    }
  } catch (error) {
    logger.error(job.queueName, `Failed to process order ${JSON.stringify(payload)}: ${error}`);
    throw error;
  }

  logger.debug(
    job.queueName,
    JSON.stringify({
      message: `[${kind}] Order save result: ${JSON.stringify(result)}`,
      orderKind: kind,
      resultStatus: result[0]?.status,
    })
  );
};
