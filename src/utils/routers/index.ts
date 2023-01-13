import { idb } from "@/common/db";
import { fromBuffer } from "@/common/utils";
import { Sources } from "@/models/sources";
import { SourcesEntity } from "@/models/sources/sources-entity";

const ROUTERS_MEMORY_CACHE: Map<string, SourcesEntity> | undefined = undefined;

export const getRouters = async (forceReload?: boolean): Promise<Map<string, SourcesEntity>> => {
  if (!forceReload && ROUTERS_MEMORY_CACHE) {
    return ROUTERS_MEMORY_CACHE;
  }

  const queryResult = await idb.manyOrNone(
    `
      SELECT
        routers.address,
        routers.source_id
      FROM routers
    `
  );

  const sources = await Sources.getInstance();

  const routers = new Map<string, SourcesEntity>();
  for (const { address, source_id } of queryResult) {
    const source = sources.get(source_id);
    if (source) {
      routers.set(fromBuffer(address), source);
    }
  }

  return routers;
};

export const forceReloadRouters = async () => getRouters(true);
