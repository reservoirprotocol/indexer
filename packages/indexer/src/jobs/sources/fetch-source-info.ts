import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import { redis } from "@/common/redis";
import { config } from "@/config/index";
import { logger } from "@/common/logger";
import axios from "axios";
import _ from "lodash";
import { HTMLElement, parse } from "node-html-parser";
import { Sources } from "@/models/sources";

const QUEUE_NAME = "fetch-source-info-queue";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 10,
    removeOnComplete: true,
    removeOnFail: 1000,
  },
});

new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

if (config.doBackgroundWork) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const { sourceDomain } = job.data;
      let url = sourceDomain;
      let iconUrl;

      if (!_.startsWith(url, "http")) {
        url = `https://${url}`;
      }

      // Get the domain HTML
      const response = await axios.get(url, {
        headers: {
          "user-agent":
            "Mozilla/5.0 (X11; Fedora; Linux x86_64; rv:89.0) Gecko/20100101 Firefox/89.0",
        },
      });
      const html = parse(response.data);

      // First get the custom reservoir title tag
      const reservoirTitle = html.querySelector("meta[property='reservoir:title']");

      let titleText = sourceDomain; // Default name for source is the domain
      if (reservoirTitle) {
        titleText = reservoirTitle.getAttribute("content");
      }

      // First get the custom reservoir icon tag
      const reservoirIcon = html.querySelector("meta[property='reservoir:icon']");

      if (reservoirIcon) {
        iconUrl = reservoirIcon.getAttribute("content");
      } else {
        // Get the domain default icon
        const icon = html.querySelector("link[rel*='icon']");
        if (icon) {
          iconUrl = icon.getAttribute("href");
        }
      }

      // If this a relative url
      if (iconUrl && _.startsWith(iconUrl, "//")) {
        iconUrl = `https://${_.trimStart(iconUrl, "//")}`;
      } else if (iconUrl && _.startsWith(iconUrl, "/")) {
        iconUrl = `${url}${iconUrl}`;
      } else if (iconUrl && !_.startsWith(iconUrl, "http")) {
        iconUrl = `${url}/${iconUrl}`;
      }

      const tokenUrlMainnet = getTokenUrl(html, url, "mainnet");
      const tokenUrlRinkeby = getTokenUrl(html, url, "rinkeby");
      const tokenUrlPolygon = getTokenUrl(html, url, "polygon");
      const tokenUrlGoerli = getTokenUrl(html, url, "goerli");
      const tokenUrlArbitrum = getTokenUrl(html, url, "arbitrum");
      const tokenUrlOptimism = getTokenUrl(html, url, "optimism");
      const tokenUrlBsc = getTokenUrl(html, url, "bsc");
      const tokenUrlZora = getTokenUrl(html, url, "zora");
      const tokenUrlSepolia = getTokenUrl(html, url, "sepolia");
      const tokenUrlMumbai = getTokenUrl(html, url, "mumbai");
      const tokenUrlBaseGoerli = getTokenUrl(html, url, "base-goerli");
      const tokenUrlArbitrumNova = getTokenUrl(html, url, "arbitrum-nova");
      const tokenUrlAvalanche = getTokenUrl(html, url, "avalanche");
      const tokenUrlScrollAlpha = getTokenUrl(html, url, "scroll-alpha");
      const tokenUrlZoraTestnet = getTokenUrl(html, url, "zora-testnet");

      // Update the source data
      const sources = await Sources.getInstance();
      await sources.update(sourceDomain, {
        title: titleText,
        icon: iconUrl,
        tokenUrlMainnet,
        tokenUrlRinkeby,
        tokenUrlPolygon,
        tokenUrlArbitrum,
        tokenUrlOptimism,
        tokenUrlBsc,
        tokenUrlGoerli,
        tokenUrlZora,
        tokenUrlSepolia,
        tokenUrlMumbai,
        tokenUrlBaseGoerli,
        tokenUrlArbitrumNova,
        tokenUrlAvalanche,
        tokenUrlScrollAlpha,
        tokenUrlZoraTestnet,
      });
    },
    {
      connection: redis.duplicate(),
      concurrency: 3,
    }
  );

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

function getTokenUrl(html: HTMLElement, domain: string, network: string) {
  let tokenUrl;

  // Get the custom reservoir token URL tag for mainnet
  const reservoirTokenUrl = html.querySelector(`meta[property='reservoir:token-url-${network}']`);

  if (reservoirTokenUrl) {
    tokenUrl = reservoirTokenUrl.getAttribute("content");

    // If this a relative url
    if (tokenUrl && _.startsWith(tokenUrl, "/")) {
      tokenUrl = `${domain}${tokenUrl}`;
    }
  }

  return tokenUrl;
}

export const addToQueue = async (sourceDomain: string, delay = 0) => {
  const jobId = `${sourceDomain}`;
  await queue.add(jobId, { sourceDomain }, { delay, jobId });
};
