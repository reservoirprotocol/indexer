import { AddressZero } from "@ethersproject/constants";
import { keccak256 } from "@ethersproject/solidity";
import { randomBytes } from "crypto";
import _ from "lodash";

import { idb } from "@/common/db";
import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { regex } from "@/common/utils";
import { config } from "@/config/index";
import * as fetchSourceInfo from "@/jobs/sources/fetch-source-info";
import {
  SourcesEntity,
  SourcesEntityParams,
  SourcesMetadata,
} from "@/models/sources/sources-entity";
import { channels } from "@/pubsub/channels";

import { default as sourcesFromJson } from "./sources.json";

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
          domain = $/domain/
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
  }

  public async create(domain: string, address: string, metadata: object = {}) {
    const source = await idb.oneOrNone(
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
        ON CONFLICT (domain) DO UPDATE SET domain = EXCLUDED.domain
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
    await fetchSourceInfo.addToQueue(domain);

    await redis.publish(channels.sourcesUpdated, `New source ${domain}`);
    logger.info("sources", `New source '${domain}' was added`);

    return new SourcesEntity(source);
  }

  public async update(domain: string, metadata: SourcesMetadata = {}, optimized?: boolean) {
    const values: { [key: string]: string | boolean } = {
      domain,
    };

    const updates = [];

    if (!_.isEmpty(metadata)) {
      let jsonBuildObject = "";

      _.forEach(metadata, (value, key) => {
        if (value) {
          jsonBuildObject += `'${key}', $/${key}/,`;
          values[key] = value;
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
    await redis.publish(channels.sourcesUpdated, `Updated source ${domain}`);
  }

  public get(
    id: number,
    contract?: string,
    tokenId?: string,
    optimizeCheckoutURL = false
  ): SourcesEntity | undefined {
    let sourceEntity: SourcesEntity;
    if (id in this.sources) {
      sourceEntity = _.cloneDeep(this.sources[id]);
    } else {
      sourceEntity = _.cloneDeep(Sources.getDefaultSource());
    }

    if (sourceEntity && contract && tokenId) {
      if (
        (!sourceEntity.optimized && optimizeCheckoutURL) ||
        (!sourceEntity.metadata.tokenUrlMainnet?.includes("${contract}") &&
          !sourceEntity.metadata.tokenUrlMainnet?.includes("${tokenId}"))
      ) {
        const defaultSource = Sources.getDefaultSource();
        sourceEntity.metadata.url = this.getTokenUrl(defaultSource, contract, tokenId);
      } else {
        sourceEntity.metadata.url = this.getTokenUrl(sourceEntity, contract, tokenId);
      }
    }

    return sourceEntity;
  }

  public getByDomain(domain: string, returnDefault = true): SourcesEntity | undefined {
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

  public getByName(name: string, returnDefault = true): SourcesEntity | undefined {
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

  // TODO: Are we using this anymore? What about support for other chains?
  public getTokenUrl(sourceEntity: SourcesEntity, contract: string, tokenId: string) {
    if (config.chainId == 1) {
      if (sourceEntity.metadata.tokenUrlMainnet && contract && tokenId) {
        sourceEntity.metadata.url = _.replace(
          sourceEntity.metadata.tokenUrlMainnet,
          "${contract}",
          contract
        );

        return _.replace(sourceEntity.metadata.url, "${tokenId}", tokenId);
      }
    } else {
      if (sourceEntity.metadata.tokenUrlRinkeby && contract && tokenId) {
        sourceEntity.metadata.url = _.replace(
          sourceEntity.metadata.tokenUrlRinkeby,
          "${contract}",
          contract
        );

        return _.replace(sourceEntity.metadata.url, "${tokenId}", tokenId);
      }
    }
  }
}
