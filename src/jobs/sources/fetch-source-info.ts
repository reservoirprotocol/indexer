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
    removeOnComplete: 100,
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
      let titleText;

      if (!_.startsWith(url, "http")) {
        url = `https://${url}`;
      }

      // Get the domain HTML
      const response = await axios.get(url);
      const html = parse(response.data);

      // First get the custom reservoir title tag
      const reservoirTitle = html.querySelector("meta[property='reservoir:title']");

      if (reservoirTitle) {
        titleText = reservoirTitle.getAttribute("content");
      } else {
        // Get the domain default title
        const title = html.querySelector("title");
        if (title) {
          titleText = title.text;
        }
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

      // Update the source data
      const sources = await Sources.getInstance();
      await sources.update(sourceDomain, {
        title: titleText,
        icon: iconUrl,
        tokenUrlMainnet,
        tokenUrlRinkeby,
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
  await queue.add(jobId, { sourceDomain }, { delay });
};
