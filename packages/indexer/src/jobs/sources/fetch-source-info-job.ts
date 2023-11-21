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
    let iconUrl: string | undefined;
    let description: string | undefined;
    let socialImage: string | undefined;
    let twitterUsername: string | undefined;

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

    const descriptionEl = html.querySelector("meta[name='description']");
    const ogDescriptionEl = html.querySelector("meta[property='og:description']");
    const twitterDescriptionEl = html.querySelector("meta[name='twitter:description']");

    if (descriptionEl) {
      description = descriptionEl.getAttribute("content");
    } else if (twitterDescriptionEl) {
      description = twitterDescriptionEl.getAttribute("content");
    } else if (ogDescriptionEl) {
      description = ogDescriptionEl.getAttribute("content");
    }

    const ogImageEl = html.querySelector("meta[property='og:image']");
    const twitterImageEl = html.querySelector("meta[name='twitter:image']");

    if (twitterImageEl) {
      socialImage = twitterImageEl.getAttribute("content");
    } else if (ogImageEl) {
      socialImage = ogImageEl.getAttribute("content");
    }

    const twitterSiteEl = html.querySelector("meta[name='twitter:site']");

    if (twitterSiteEl) {
      twitterUsername = twitterSiteEl.getAttribute("content");
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
    const tokenUrlZora = this.getTokenUrl(html, url, "zora");
    const tokenUrlSepolia = this.getTokenUrl(html, url, "sepolia");
    const tokenUrlMumbai = this.getTokenUrl(html, url, "mumbai");
    const tokenUrlBaseGoerli = this.getTokenUrl(html, url, "base-goerli");
    const tokenUrlArbitrumNova = this.getTokenUrl(html, url, "arbitrum-nova");
    const tokenUrlAvalanche = this.getTokenUrl(html, url, "avalanche");
    const tokenUrlScrollAlpha = this.getTokenUrl(html, url, "scroll-alpha");
    const tokenUrlZoraTestnet = this.getTokenUrl(html, url, "zora-testnet");
    const tokenUrlBase = this.getTokenUrl(html, url, "base");
    const tokenUrlZksync = this.getTokenUrl(html, url, "zksync");
    const tokenUrlPolygonZkevm = this.getTokenUrl(html, url, "polygon-zkevm");
    const tokenUrlX1Testnet = this.getTokenUrl(html, url, "x1-testnet");

    // Update the source data
    const sources = await Sources.getInstance();
    await sources.update(sourceDomain, {
      title: titleText,
      icon: iconUrl,
      description,
      socialImage,
      twitterUsername,
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
      tokenUrlBase,
      tokenUrlZksync,
      tokenUrlPolygonZkevm,
      tokenUrlX1Testnet,
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
