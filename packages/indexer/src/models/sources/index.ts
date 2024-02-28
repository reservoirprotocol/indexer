import { AddressZero } from "@ethersproject/constants";
import { keccak256 } from "@ethersproject/solidity";
import { randomBytes } from "crypto";
import _ from "lodash";

import { idb, redb } from "@/common/db";
import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { regex } from "@/common/utils";
import { config } from "@/config/index";
import {
  SourcesEntity,
  SourcesEntityParams,
  SourcesMetadata,
} from "@/models/sources/sources-entity";
import { Channel } from "@/pubsub/channels";

import { default as sourcesFromJson } from "./sources.json";
import { fetchSourceInfoJob } from "@/jobs/sources/fetch-source-info-job";

export class Sources {
  private static instance: Sources;

  public sources: { [id: number]: SourcesEntity };
  public sourcesByName: { [name: string]: SourcesEntity };
  public sourcesByAddress: { [address: string]: SourcesEntity };
  public sourcesByDomain: { [domain: string]: SourcesEntity };
  public sourcesByDomainHash: { [domainHash: string]: SourcesEntity };

  private constructor() {
    this.sources = {};
    this.sourcesByName = {};
    this.sourcesByAddress = {};
    this.sourcesByDomain = {};
    this.sourcesByDomainHash = {};
  }

  private async loadData(forceDbLoad = false) {
    // Try to load from cache
    const sourcesCache = await redis.get(Sources.getCacheKey());
    let sources: SourcesEntityParams[];

    if (_.isNull(sourcesCache) || forceDbLoad) {
      // If no cache is available, then load from the database
      sources = await idb.manyOrNone(
        `
          SELECT
            sources_v2.id,
            sources_v2.domain,
            sources_v2.domain_hash AS "domainHash",
            sources_v2.name,
            sources_v2.address,
            sources_v2.metadata,
            sources_v2.optimized
          FROM sources_v2
        `
      );
      await redis.set(Sources.getCacheKey(), JSON.stringify(sources), "EX", 60 * 60 * 24);
    } else {
      // Parse the data
      sources = JSON.parse(sourcesCache);
    }

    for (const source of sources) {
      this.sources[source.id] = new SourcesEntity(source);
      this.sourcesByName[_.toLower(source.name)] = new SourcesEntity(source);
      this.sourcesByAddress[_.toLower(source.address)] = new SourcesEntity(source);
      this.sourcesByDomain[_.toLower(source.domain)] = new SourcesEntity(source);
      this.sourcesByDomainHash[_.toLower(source.domainHash)] = new SourcesEntity(source);
    }
  }

  public static getCacheKey() {
    return "sources";
  }

  public static async getInstance() {
    if (!Sources.instance) {
      Sources.instance = new Sources();
      await Sources.instance.loadData();
    }

    return Sources.instance;
  }

  public static async forceDataReload() {
    if (Sources.instance) {
      await Sources.instance.loadData(true);
    }
  }

  public static getDefaultSource(): SourcesEntity {
    return new SourcesEntity({
      id: 0,
      domain: "reservoir.tools",
      domainHash: "0x1d4da48b",
      address: AddressZero,
      name: "Reservoir",
      metadata: {
        icon: "https://www.reservoir.market/reservoir.svg",
        tokenUrlMainnet: "https://www.reservoir.market/${contract}/${tokenId}",
        tokenUrlRinkeby: "https://dev.reservoir.market/${contract}/${tokenId}",
      },
      optimized: true,
      createdAt: "2022-02-05 04:50:47.191 +0200",
    });
  }

  public static async syncSources() {
    _.forEach(sourcesFromJson, (item, id) => {
      Sources.addFromJson(
        Number(id),
        item.domain,
        item.domainHash,
        item.name,
        item.address,
        item.data
      );
    });
  }

  public static async addFromJson(
    id: number,
    domain: string,
    domainHash: string,
    name: string,
    address: string,
    metadata: object
  ) {
    try {
      await idb.none(
        `
        INSERT INTO sources_v2(
          id,
          domain,
          domain_hash,
          name,
          address,
          metadata
        ) VALUES (
          $/id/,
          $/domain/,
          $/domainHash/,
          $/name/,
          $/address/,
          $/metadata:json/
        )
        ON CONFLICT (id) DO UPDATE SET
          metadata = $/metadata:json/,
          domain = $/domain/,
          updated_at = now()
      `,
        {
          id,
          domain,
          domainHash,
          name,
          address,
          metadata,
        }
      );
    } catch (error) {
      // Ignore errors when loading from JSON
    }
  }

  public async create(domain: string, address: string, metadata: object = {}) {
    // It could be the source already exist
    let source = await redb.oneOrNone(
      `
      SELECT *
      FROM sources_v2
      WHERE domain = $/domain/
    `,
      {
        domain,
      }
    );

    if (source) {
      return new SourcesEntity(source);
    }

    source = await idb.oneOrNone(
      `
        INSERT INTO sources_v2(
          domain,
          domain_hash,
          name,
          address,
          metadata
        ) VALUES (
          $/domain/,
          $/domainHash/,
          $/name/,
          $/address/,
          $/metadata:json/
        )
        ON CONFLICT (domain) DO UPDATE SET domain = EXCLUDED.domain, updated_at = now()
        RETURNING *
      `,
      {
        domain,
        domainHash: keccak256(["string"], [domain]).slice(0, 10),
        name: domain,
        address,
        metadata,
      }
    );

    // Reload the cache
    await Sources.instance.loadData(true);
    // Fetch domain info
    await fetchSourceInfoJob.addToQueue({ sourceDomain: domain });

    await redis.publish(Channel.SourcesUpdated, `New source ${domain}`);
    logger.info("sources", `New source '${domain}' was added`);

    return new SourcesEntity(source);
  }

  public async update(domain: string, metadata: SourcesMetadata = {}, optimized?: boolean) {
    const values: { [key: string]: string | string[] | boolean } = {
      domain,
    };

    const updates = [];

    if (!_.isEmpty(metadata)) {
      let jsonBuildObject = "";

      _.forEach(metadata, (value, key) => {
        if (value) {
          // To cover the case when we need to empty an array
          if (Array.isArray(value) && value.length === 0) {
            jsonBuildObject += `'${key}', '[]'::jsonb,`;
            values[key] = value;
          } else {
            jsonBuildObject += `'${key}', $/${key}/,`;
            values[key] = value;
          }
        }
      });

      if (jsonBuildObject.length) {
        jsonBuildObject = _.trimEnd(jsonBuildObject, ",");
        updates.push(`metadata = metadata || jsonb_build_object (${jsonBuildObject})`);
      }
    }

    if (optimized != undefined) {
      values["optimized"] = optimized;
      updates.push(`optimized = $/optimized/`);
    }

    if (!updates.length) {
      return;
    }

    const updatesString = updates.map((c) => `${c}`).join(",");

    await idb.none(
      `
        UPDATE sources_v2 SET
          ${updatesString}
        WHERE domain = $/domain/
      `,
      values
    );

    // Reload the cache
    await Sources.instance.loadData(true);
    await redis.publish(Channel.SourcesUpdated, `Updated source ${domain}`);
  }

  public get(
    id: number,
    contract?: string,
    tokenId?: string,
    optimizeCheckoutURL = false,
    returnDefault = false
  ): SourcesEntity | undefined {
    let sourceEntity: SourcesEntity | undefined;
    if (id in this.sources) {
      sourceEntity = _.cloneDeep(this.sources[id]);
    } else if (returnDefault) {
      sourceEntity = _.cloneDeep(Sources.getDefaultSource());
    }

    if (sourceEntity && contract && tokenId) {
      if (
        (!sourceEntity.optimized && optimizeCheckoutURL) ||
        (!sourceEntity.metadata.tokenUrlMainnet?.includes("${contract}") &&
          !sourceEntity.metadata.tokenUrlMainnet?.includes("${tokenId}"))
      ) {
        if (returnDefault) {
          const defaultSource = Sources.getDefaultSource();
          sourceEntity.metadata.url = this.getTokenUrl(defaultSource, contract, tokenId);
        }
      } else {
        sourceEntity.metadata.url = this.getTokenUrl(sourceEntity, contract, tokenId);
      }
    }

    return sourceEntity;
  }

  public getByDomain(domain: string, returnDefault = false): SourcesEntity | undefined {
    let sourceEntity: SourcesEntity | undefined;

    if (_.toLower(domain) in this.sourcesByDomain) {
      sourceEntity = this.sourcesByDomain[_.toLower(domain)];
    } else if (returnDefault) {
      sourceEntity = Sources.getDefaultSource();
    }

    return sourceEntity;
  }

  public getByDomainHash(domainHash: string): SourcesEntity | undefined {
    if (this.sourcesByDomainHash[domainHash]) {
      return this.sourcesByDomainHash[domainHash];
    }
  }

  public getByName(name: string, returnDefault = false): SourcesEntity | undefined {
    let sourceEntity: SourcesEntity | undefined;

    if (_.toLower(name) in this.sourcesByName) {
      sourceEntity = this.sourcesByName[_.toLower(name)];
    } else if (returnDefault) {
      sourceEntity = Sources.getDefaultSource();
    }

    return sourceEntity;
  }

  public getByAddress(
    address: string,
    options?: {
      contract?: string;
      tokenId?: string;
      returnDefault?: boolean;
    }
  ): SourcesEntity | undefined {
    let sourceEntity: SourcesEntity | undefined;

    address = _.toLower(address);
    if (address in this.sourcesByAddress) {
      sourceEntity = this.sourcesByAddress[address];
    } else if (options?.returnDefault) {
      sourceEntity = Sources.getDefaultSource();
    }

    if (sourceEntity && options?.contract && options?.tokenId) {
      sourceEntity.metadata.url = this.getTokenUrl(sourceEntity, options.contract, options.tokenId);
    }

    return sourceEntity;
  }

  public async getOrInsert(source: string): Promise<SourcesEntity> {
    let sourceEntity: SourcesEntity | undefined;

    if (source.match(regex.address)) {
      // Case 1: source is an address (deprecated)

      sourceEntity = this.getByAddress(source);
      if (!sourceEntity) {
        sourceEntity = await this.create(source, source);
      }
    } else {
      // Case 2: source is a name (deprecated)
      sourceEntity = this.getByName(source, false);

      // Case 3: source is a domain
      if (!sourceEntity) {
        sourceEntity = this.getByDomain(source, false);
      }

      // Create the source if nothing is available
      if (!sourceEntity) {
        const address = "0x" + randomBytes(20).toString("hex");
        sourceEntity = await this.create(source, address);
      }
    }

    return sourceEntity;
  }

  public getTokenUrl(sourceEntity: SourcesEntity, contract?: string, tokenId?: string) {
    if (config.chainId == 1) {
      if (sourceEntity.metadata.tokenUrlMainnet && contract && tokenId) {
        sourceEntity.metadata.url = _.replace(
          sourceEntity.metadata.tokenUrlMainnet,
          "${contract}",
          contract
        );

        return _.replace(sourceEntity.metadata.url, "${tokenId}", tokenId);
      }
    } else if (config.chainId == 10) {
      if (sourceEntity.metadata.tokenUrlOptimism && contract && tokenId) {
        sourceEntity.metadata.url = _.replace(
          sourceEntity.metadata.tokenUrlOptimism,
          "${contract}",
          contract
        );

        return _.replace(sourceEntity.metadata.url, "${tokenId}", tokenId);
      }
    } else if (config.chainId == 56) {
      if (sourceEntity.metadata.tokenUrlBsc && contract && tokenId) {
        sourceEntity.metadata.url = _.replace(
          sourceEntity.metadata.tokenUrlBsc,
          "${contract}",
          contract
        );

        return _.replace(sourceEntity.metadata.url, "${tokenId}", tokenId);
      }
    } else if (config.chainId == 137) {
      if (sourceEntity.metadata.tokenUrlPolygon && contract && tokenId) {
        sourceEntity.metadata.url = _.replace(
          sourceEntity.metadata.tokenUrlPolygon,
          "${contract}",
          contract
        );

        return _.replace(sourceEntity.metadata.url, "${tokenId}", tokenId);
      }
    } else if (config.chainId == 324) {
      if (sourceEntity.metadata.tokenUrlZksync && contract && tokenId) {
        sourceEntity.metadata.url = _.replace(
          sourceEntity.metadata.tokenUrlZksync,
          "${contract}",
          contract
        );

        return _.replace(sourceEntity.metadata.url, "${tokenId}", tokenId);
      }
    } else if (config.chainId == 42161) {
      if (sourceEntity.metadata.tokenUrlArbitrum && contract && tokenId) {
        sourceEntity.metadata.url = _.replace(
          sourceEntity.metadata.tokenUrlArbitrum,
          "${contract}",
          contract
        );

        return _.replace(sourceEntity.metadata.url, "${tokenId}", tokenId);
      }
    } else if (config.chainId == 7777777) {
      if (sourceEntity.metadata.tokenUrlZora && contract && tokenId) {
        sourceEntity.metadata.url = _.replace(
          sourceEntity.metadata.tokenUrlZora,
          "${contract}",
          contract
        );

        return _.replace(sourceEntity.metadata.url, "${tokenId}", tokenId);
      }
    } else if (config.chainId == 11155111) {
      if (sourceEntity.metadata.tokenUrlSepolia && contract && tokenId) {
        sourceEntity.metadata.url = _.replace(
          sourceEntity.metadata.tokenUrlSepolia,
          "${contract}",
          contract
        );

        return _.replace(sourceEntity.metadata.url, "${tokenId}", tokenId);
      }
    } else if (config.chainId == 80001) {
      if (sourceEntity.metadata.tokenUrlMumbai && contract && tokenId) {
        sourceEntity.metadata.url = _.replace(
          sourceEntity.metadata.tokenUrlMumbai,
          "${contract}",
          contract
        );

        return _.replace(sourceEntity.metadata.url, "${tokenId}", tokenId);
      }
    } else if (config.chainId == 84531) {
      if (sourceEntity.metadata.tokenUrlBaseGoerli && contract && tokenId) {
        sourceEntity.metadata.url = _.replace(
          sourceEntity.metadata.tokenUrlBaseGoerli,
          "${contract}",
          contract
        );

        return _.replace(sourceEntity.metadata.url, "${tokenId}", tokenId);
      }
    } else if (config.chainId == 42170) {
      if (sourceEntity.metadata.tokenUrlArbitrumNova && contract && tokenId) {
        sourceEntity.metadata.url = _.replace(
          sourceEntity.metadata.tokenUrlArbitrumNova,
          "${contract}",
          contract
        );

        return _.replace(sourceEntity.metadata.url, "${tokenId}", tokenId);
      }
    } else if (config.chainId == 43114) {
      if (sourceEntity.metadata.tokenUrlAvalanche && contract && tokenId) {
        sourceEntity.metadata.url = _.replace(
          sourceEntity.metadata.tokenUrlAvalanche,
          "${contract}",
          contract
        );

        return _.replace(sourceEntity.metadata.url, "${tokenId}", tokenId);
      }
    } else if (config.chainId == 534353) {
      if (sourceEntity.metadata.tokenUrlScrollAlpha && contract && tokenId) {
        sourceEntity.metadata.url = _.replace(
          sourceEntity.metadata.tokenUrlScrollAlpha,
          "${contract}",
          contract
        );

        return _.replace(sourceEntity.metadata.url, "${tokenId}", tokenId);
      }
    } else if (config.chainId == 999) {
      if (sourceEntity.metadata.tokenUrlZoraTestnet && contract && tokenId) {
        sourceEntity.metadata.url = _.replace(
          sourceEntity.metadata.tokenUrlZoraTestnet,
          "${contract}",
          contract
        );

        return _.replace(sourceEntity.metadata.url, "${tokenId}", tokenId);
      }
    } else if (config.chainId == 8453) {
      if (sourceEntity.metadata.tokenUrlBase && contract && tokenId) {
        sourceEntity.metadata.url = _.replace(
          sourceEntity.metadata.tokenUrlBase,
          "${contract}",
          contract
        );

        return _.replace(sourceEntity.metadata.url, "${tokenId}", tokenId);
      }
    } else if (config.chainId == 1101) {
      if (sourceEntity.metadata.tokenUrlPolygonZkevm && contract && tokenId) {
        sourceEntity.metadata.url = _.replace(
          sourceEntity.metadata.tokenUrlPolygonZkevm,
          "${contract}",
          contract
        );

        return _.replace(sourceEntity.metadata.url, "${tokenId}", tokenId);
      }
    } else if (config.chainId == 534352) {
      if (sourceEntity.metadata.tokenUrlScroll && contract && tokenId) {
        sourceEntity.metadata.url = _.replace(
          sourceEntity.metadata.tokenUrlScroll,
          "${contract}",
          contract
        );

        return _.replace(sourceEntity.metadata.url, "${tokenId}", tokenId);
      }
    } else if (config.chainId == 13472) {
      if (sourceEntity.metadata.tokenUrlImmutableZkevmTestnet && contract && tokenId) {
        sourceEntity.metadata.url = _.replace(
          sourceEntity.metadata.tokenUrlImmutableZkevmTestnet,
          "${contract}",
          contract
        );

        return _.replace(sourceEntity.metadata.url, "${tokenId}", tokenId);
      }
    } else if (config.chainId == 68840142) {
      if (sourceEntity.metadata.tokenUrlFrameTestnet && contract && tokenId) {
        sourceEntity.metadata.url = _.replace(
          sourceEntity.metadata.tokenUrlFrameTestnet,
          "${contract}",
          contract
        );

        return _.replace(sourceEntity.metadata.url, "${tokenId}", tokenId);
      }
    } else if (config.chainId == 204) {
      if (sourceEntity.metadata.tokenUrlOpbnb && contract && tokenId) {
        sourceEntity.metadata.url = _.replace(
          sourceEntity.metadata.tokenUrlOpbnb,
          "${contract}",
          contract
        );

        return _.replace(sourceEntity.metadata.url, "${tokenId}", tokenId);
      }
    } else if (config.chainId == 28122024) {
      if (sourceEntity.metadata.tokenUrlAncient8Testnet && contract && tokenId) {
        sourceEntity.metadata.url = _.replace(
          sourceEntity.metadata.tokenUrlAncient8Testnet,
          "${contract}",
          contract
        );

        return _.replace(sourceEntity.metadata.url, "${tokenId}", tokenId);
      }
    } else if (config.chainId == 888888888) {
      if (sourceEntity.metadata.tokenUrlAncient8 && contract && tokenId) {
        sourceEntity.metadata.url = _.replace(
          sourceEntity.metadata.tokenUrlAncient8,
          "${contract}",
          contract
        );

        return _.replace(sourceEntity.metadata.url, "${tokenId}", tokenId);
      }
    } else if (config.chainId == 84532) {
      if (sourceEntity.metadata.tokenUrlBaseSepolia && contract && tokenId) {
        sourceEntity.metadata.url = _.replace(
          sourceEntity.metadata.tokenUrlBaseSepolia,
          "${contract}",
          contract
        );

        return _.replace(sourceEntity.metadata.url, "${tokenId}", tokenId);
      }
    } else if (config.chainId == 168587773) {
      if (sourceEntity.metadata.tokenUrlBlastSepolia && contract && tokenId) {
        sourceEntity.metadata.url = _.replace(
          sourceEntity.metadata.tokenUrlBlastSepolia,
          "${contract}",
          contract
        );

        return _.replace(sourceEntity.metadata.url, "${tokenId}", tokenId);
      }
    } else if (config.chainId == 70700) {
      if (sourceEntity.metadata.tokenUrlApex && contract && tokenId) {
        sourceEntity.metadata.url = _.replace(
          sourceEntity.metadata.tokenUrlApex,
          "${contract}",
          contract
        );

        return _.replace(sourceEntity.metadata.url, "${tokenId}", tokenId);
      }
    } else {
      if (sourceEntity.metadata.tokenUrlGoerli && contract && tokenId) {
        sourceEntity.metadata.url = _.replace(
          sourceEntity.metadata.tokenUrlGoerli,
          "${contract}",
          contract
        );

        return _.replace(sourceEntity.metadata.url, "${tokenId}", tokenId);
      }
    }
  }
}
