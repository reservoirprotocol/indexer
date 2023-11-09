import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { HTMLElement, parse } from "node-html-parser";
import _ from "lodash";
import axios from "axios";
import { Sources } from "@/models/sources";
import { logger } from "@/common/logger";

export type FetchSourceInfoJobPayload = {
  sourceDomain: string;
};

export default class FetchSourceInfoJob extends AbstractRabbitMqJobHandler {
  queueName = "fetch-source-info-queue";
  maxRetries = 10;
  concurrency = 3;
  persistent = false;
  useSharedChannel = true;
  lazyMode = true;

  public async process(payload: FetchSourceInfoJobPayload) {
    const { sourceDomain } = payload;

    logger.info(this.queueName, `Start. sourceDomain=${sourceDomain}`);

    let url = sourceDomain;
    let iconUrl: string | undefined;
    let description: string | undefined;
    let socialImage: string | undefined;
    let twitterUsername: string | undefined;
    let titleText = sourceDomain; // Default name for source is the domain

    let tokenUrlMainnet;
    let tokenUrlRinkeby;
    let tokenUrlPolygon;
    let tokenUrlGoerli;
    let tokenUrlArbitrum;
    let tokenUrlOptimism;
    let tokenUrlBsc;
    let tokenUrlZora;
    let tokenUrlSepolia;
    let tokenUrlMumbai;
    let tokenUrlBaseGoerli;
    let tokenUrlArbitrumNova;
    let tokenUrlAvalanche;
    let tokenUrlScrollAlpha;
    let tokenUrlZoraTestnet;
    let tokenUrlBase;
    let tokenUrlZksync;
    let tokenUrlPolygonZkevm;
    let tokenUrlScroll;
    let tokenUrlImmutableZkevmTestnet;

    if (!_.startsWith(url, "http")) {
      url = `https://${url}`;
    }

    try {
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

      tokenUrlMainnet = this.getTokenUrl(html, url, "mainnet");
      tokenUrlRinkeby = this.getTokenUrl(html, url, "rinkeby");
      tokenUrlPolygon = this.getTokenUrl(html, url, "polygon");
      tokenUrlGoerli = this.getTokenUrl(html, url, "goerli");
      tokenUrlArbitrum = this.getTokenUrl(html, url, "arbitrum");
      tokenUrlOptimism = this.getTokenUrl(html, url, "optimism");
      tokenUrlBsc = this.getTokenUrl(html, url, "bsc");
      tokenUrlZora = this.getTokenUrl(html, url, "zora");
      tokenUrlSepolia = this.getTokenUrl(html, url, "sepolia");
      tokenUrlMumbai = this.getTokenUrl(html, url, "mumbai");
      tokenUrlBaseGoerli = this.getTokenUrl(html, url, "base-goerli");
      tokenUrlArbitrumNova = this.getTokenUrl(html, url, "arbitrum-nova");
      tokenUrlAvalanche = this.getTokenUrl(html, url, "avalanche");
      tokenUrlScrollAlpha = this.getTokenUrl(html, url, "scroll-alpha");
      tokenUrlZoraTestnet = this.getTokenUrl(html, url, "zora-testnet");
      tokenUrlBase = this.getTokenUrl(html, url, "base");
      tokenUrlZksync = this.getTokenUrl(html, url, "zksync");
      tokenUrlPolygonZkevm = this.getTokenUrl(html, url, "polygon-zkevm");
      tokenUrlScroll = this.getTokenUrl(html, url, "scroll");
      tokenUrlImmutableZkevmTestnet = this.getTokenUrl(html, url, "immutable-zkevm-testnet");
    } catch (error) {
      logger.info(this.queueName, `Get html error. sourceDomain=${sourceDomain}, error=${error}`);
    }

    if (!iconUrl) {
      logger.info(
        this.queueName,
        `Debug favicon. sourceDomain=${sourceDomain}, iconUrl=${iconUrl}`
      );

      const faviconUrl = `${url}/favicon.ico`;

      try {
        await axios.get(faviconUrl, {
          headers: {
            "user-agent":
              "Mozilla/5.0 (X11; Fedora; Linux x86_64; rv:89.0) Gecko/20100101 Firefox/89.0",
          },
        });

        iconUrl = faviconUrl;
      } catch (error) {
        logger.info(
          this.queueName,
          `Debug favicon2. sourceDomain=${sourceDomain}, iconUrl=${iconUrl}, error=${error}`
        );
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

    logger.info(
      this.queueName,
      JSON.stringify({
        message: `Debug. sourceDomain=${sourceDomain}`,
        data: {
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
          tokenUrlScroll,
          tokenUrlImmutableZkevmTestnet,
        },
      })
    );

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
      tokenUrlScroll,
      tokenUrlImmutableZkevmTestnet,
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
