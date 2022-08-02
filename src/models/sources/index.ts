/* eslint-disable @typescript-eslint/no-explicit-any */
import _ from "lodash";

import { randomBytes } from "crypto";
import { redis } from "@/common/redis";
import { config } from "@/config/index";
import { idb, redb } from "@/common/db";
import { regex } from "@/common/utils";
import {
  SourcesEntity,
  SourcesEntityParams,
  SourcesMetadata,
} from "@/models/sources/sources-entity";
import { AddressZero } from "@ethersproject/constants";

import { default as sourcesFromJson } from "./sources.json";
import { logger } from "@/common/logger";
import * as fetchSourceInfo from "@/jobs/sources/fetch-source-info";
import { channels } from "@/pubsub/channels";

export class Sources {
  private static instance: Sources;

  public sources: object;
  public sourcesByNames: object;
  public sourcesByAddress: object;
  public sourcesByDomains: object;

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  private constructor() {
    this.sources = {};
    this.sourcesByNames = {};
    this.sourcesByAddress = {};
    this.sourcesByDomains = {};
  }

  private async loadData(forceDbLoad = false) {
    // Try to load from cache
    const sourcesCache = await redis.get(Sources.getCacheKey());
    let sources: SourcesEntityParams[];

    if (_.isNull(sourcesCache) || forceDbLoad) {
      // If no cache load from DB
      sources = await redb.manyOrNone(`SELECT * FROM sources_v2`);
      await redis.set(Sources.getCacheKey(), JSON.stringify(sources), "EX", 60 * 60 * 24);
    } else {
      // Parse the cache data
      sources = JSON.parse(sourcesCache);
    }

    for (const source of sources) {
      (this.sources as any)[source.id] = new SourcesEntity(source);
      (this.sourcesByNames as any)[_.toLower(source.name)] = new SourcesEntity(source);
      (this.sourcesByAddress as any)[_.toLower(source.address)] = new SourcesEntity(source);
      (this.sourcesByDomains as any)[_.toLower(source.domain)] = new SourcesEntity(source);
    }
  }

  public static getCacheKey() {
    return "sources";
  }

  public static async getInstance() {
    if (!this.instance) {
      this.instance = new Sources();
      await this.instance.loadData();
    }

    return this.instance;
  }

  public static async forceDataReload() {
    if (this.instance) {
      await this.instance.loadData(true);
    }
  }

  public static getDefaultSource(): SourcesEntity {
    return new SourcesEntity({
      id: 0,
      domain: "reservoir.market",
      address: AddressZero,
      name: "Reservoir",
      metadata: {
        icon: "https://www.reservoir.market/reservoir.svg",
        tokenUrlMainnet: "https://www.reservoir.market/collections/${contract}/${tokenId}",
        tokenUrlRinkeby: "https://www.reservoir.fun/collections/${contract}/${tokenId}",
      },
    });
  }

  public static async syncSources() {
    _.forEach(sourcesFromJson, (item, id) => {
      Sources.addFromJson(Number(id), item.domain, item.name, item.address, item.data);
    });
  }

  public static async addFromJson(
    id: number,
    domain: string,
    name: string,
    address: string,
    metadata: object
  ) {
    const query = `INSERT INTO sources_v2 (id, domain, name, address, metadata)
                   VALUES ($/id/, $/domain/, $/name/, $/address/, $/metadata:json/)
                   ON CONFLICT (id) DO UPDATE
                   SET metadata = $/metadata:json/, name = $/name/, domain = $/domain/`;

    const values = {
      id,
      domain,
      name,
      address,
      metadata,
    };

    await idb.none(query, values);
  }

  public async create(domain: string, address: string, metadata: object = {}) {
    const query = `INSERT INTO sources_v2 (domain, name, address, metadata)
                   VALUES ($/domain/, $/domain/, $/address/, $/metadata:json/)
                   ON CONFLICT (domain) DO UPDATE SET domain = EXCLUDED.domain
                   RETURNING *`;

    const values = {
      domain,
      address,
      metadata,
    };

    const source = await idb.oneOrNone(query, values);
    const sourcesEntity = new SourcesEntity(source);

    await Sources.instance.loadData(true); // reload the cache
    await fetchSourceInfo.addToQueue(domain); // Fetch domain info
    await redis.publish(channels.sourcesUpdated, `New source ${domain}`);

    logger.info("sources", `New source ${domain} - ${address} was added`);

    return sourcesEntity;
  }

  public async update(domain: string, metadata: SourcesMetadata = {}) {
    const values = {
      domain,
    };

    let jsonBuildObject = "";
    _.forEach(metadata, (value, key) => {
      if (!_.isUndefined(value)) {
        jsonBuildObject += `'${key}', $/${key}/,`;
        (values as any)[key] = value;
      }
    });

    if (jsonBuildObject == "") {
      return;
    }

    jsonBuildObject = _.trimEnd(jsonBuildObject, ",");

    const query = `UPDATE sources_v2
                   SET metadata = metadata || jsonb_build_object (${jsonBuildObject})
                   WHERE domain = $/domain/`;

    await idb.none(query, values);

    await Sources.instance.loadData(true); // reload the cache
    await redis.publish(channels.sourcesUpdated, `Updated source ${domain}`);
  }

  public get(id: number, contract?: string, tokenId?: string): SourcesEntity {
    let sourceEntity;

    if (id in this.sources) {
      sourceEntity = (this.sources as any)[id];
    } else {
      sourceEntity = Sources.getDefaultSource();
    }

    if (sourceEntity && contract && tokenId) {
      sourceEntity.metadata.url = this.getTokenUrl(sourceEntity, contract, tokenId);
    }

    return sourceEntity;
  }

  public getByDomain(domain: string, returnDefault = true): SourcesEntity {
    let sourceEntity;

    if (_.toLower(domain) in this.sourcesByDomains) {
      sourceEntity = (this.sourcesByDomains as any)[_.toLower(domain)];
    } else if (returnDefault) {
      sourceEntity = Sources.getDefaultSource();
    }

    return sourceEntity;
  }

  public getByName(name: string, returnDefault = true): SourcesEntity {
    let sourceEntity;

    if (_.toLower(name) in this.sourcesByNames) {
      sourceEntity = (this.sourcesByNames as any)[_.toLower(name)];
    } else if (returnDefault) {
      sourceEntity = Sources.getDefaultSource();
    }

    return sourceEntity;
  }

  public getByAddress(
    address: string,
    contract?: string,
    tokenId?: string,
    returnDefault = true
  ): SourcesEntity {
    let sourceEntity;

    if (_.toLower(address) in this.sourcesByAddress) {
      sourceEntity = (this.sourcesByAddress as any)[_.toLower(address)];
    } else if (returnDefault) {
      sourceEntity = Sources.getDefaultSource();
    }

    if (sourceEntity && contract && tokenId) {
      sourceEntity.metadata.url = this.getTokenUrl(sourceEntity, contract, tokenId);
    }

    return sourceEntity;
  }

  public async getOrInsert(source: string): Promise<SourcesEntity> {
    let sourceEntity;

    // If the passed source is an address
    if (source.match(regex.address)) {
      sourceEntity = this.getByAddress(source, undefined, undefined, false); // This is an address

      if (!sourceEntity) {
        sourceEntity = await this.create(source, source);
      }
    } else {
      // Try to get the source by name
      sourceEntity = this.getByName(source, false);

      // If the source was not found try to get it by domain
      if (!sourceEntity) {
        sourceEntity = this.getByDomain(source, false);
      }

      // If source was not found by name nor domain create one
      if (!sourceEntity) {
        const address = "0x" + randomBytes(20).toString("hex");
        sourceEntity = await this.create(source, address);
      }
    }

    return sourceEntity;
  }

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
