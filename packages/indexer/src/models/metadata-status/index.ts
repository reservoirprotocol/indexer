import { redis } from "@/common/redis";
import { Channel } from "@/pubsub/channels";

export class MetadataStatus {
  public static disabled: { [id: string]: boolean } = {};

  public static async disable(ids: string[]): Promise<void> {
    if (ids.length) {
      await redis.hset(`metadata-disabled-collection`, ids, ids);

      for (const id of ids) {
        MetadataStatus.disabled[id] = true;
      }
    }
  }

  public static async enable(ids: string[]): Promise<void> {
    if (ids.length) {
      await redis.hdel(`metadata-disabled-collection`, ids);
      await redis.publish(Channel.MetadataReenabled, JSON.stringify({ ids }));

      for (const id of ids) {
        delete MetadataStatus.disabled[id];
      }
    }
  }

  public static async get(ids: string[]): Promise<{ [id: string]: boolean }> {
    const result: { [id: string]: boolean } = {};

    ids = ids.filter((id) => {
      const isDisabled = MetadataStatus.disabled[id];
      if (isDisabled) {
        result[id] = true;
      }
      return !(id in MetadataStatus.disabled);
    });

    if (ids.length) {
      const disabled = await redis.hmget(`metadata-disabled-collection`, ids);
      for (let i = 0; i < ids.length; i++) {
        if (disabled[i]) {
          result[ids[i]] = true;
          MetadataStatus.disabled[ids[i]] = true;
        }
      }
    }

    return result;
  }

  public static async isDisabled(id: string): Promise<boolean> {
    const result = await redis.hget(`metadata-disabled-collection`, id);
    return result !== null;
  }
}
