import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { HTMLElement, parse } from "node-html-parser";
import _ from "lodash";
import axios from "axios";
import { Sources } from "@/models/sources";

export type FetchSourceInfoJobPayload = {
  sourceDomain: string;
};

export class FetchSourceInfoJob extends AbstractRabbitMqJobHandler {
  queueName = "fetch-source-info-queue";
  maxRetries = 10;
  concurrency = 3;
  persistent = false;
  useSharedChannel = true;
  lazyMode = true;

  protected async process(payload: FetchSourceInfoJobPayload) {
    const { sourceDomain } = payload;

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
      titleText = reservoirTitle.getAttribute("content") ?? "";
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

    const tokenUrlMainnet = this.getTokenUrl(html, url, "mainnet");
    const tokenUrlRinkeby = this.getTokenUrl(html, url, "rinkeby");
    const tokenUrlPolygon = this.getTokenUrl(html, url, "polygon");
    const tokenUrlGoerli = this.getTokenUrl(html, url, "goerli");
    const tokenUrlArbitrum = this.getTokenUrl(html, url, "arbitrum");
    const tokenUrlOptimism = this.getTokenUrl(html, url, "optimism");
    const tokenUrlBsc = this.getTokenUrl(html, url, "bsc");

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
    });
  }

  public getTokenUrl(html: HTMLElement, domain: string, network: string) {
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

  public async addToQueue(params: FetchSourceInfoJobPayload) {
    await this.send({ payload: params, jobId: params.sourceDomain });
  }
}

export const fetchSourceInfoJob = new FetchSourceInfoJob();
