import { txdb } from "@/common/db";
import { fromBuffer, toBuffer } from "@/common/utils";

export type Block = {
  hash: string;
  number: number;
  timestamp: number;
};

export const _saveBlock = async (blockData: Block) => {
  const timerStart = Date.now();
  await saveBlock(blockData);
  const timerEnd = Date.now();
  return {
    saveBlocksTime: timerEnd - timerStart,
    endSaveBlocksTime: timerEnd,
  };
};

export const saveBlock = async (block: Block): Promise<Block> => {
  await txdb.none(
    `
      INSERT INTO blocks (
        hash,
        number,
        "timestamp"
      ) VALUES (
        $/hash/,
        $/number/,
        $/timestamp/
      )
      ON CONFLICT DO NOTHING
    `,
    {
      hash: toBuffer(block.hash),
      number: block.number,
      timestamp: block.timestamp,
    }
  );

  return block;
};

export const deleteBlock = async (number: number, hash: string) =>
  txdb.none(
    `
      DELETE FROM blocks
      WHERE blocks.hash = $/hash/
        AND blocks.number = $/number/
    `,
    {
      hash: toBuffer(hash),
      number,
    }
  );

export const getBlocks = async (number: number): Promise<Block[]> =>
  txdb
    .manyOrNone(
      `
        SELECT
          blocks.hash,
          blocks.timestamp
        FROM blocks
        WHERE blocks.number = $/number/
      `,
      { number }
    )
    .then((result) =>
      result.map(({ hash, timestamp }) => ({
        hash: fromBuffer(hash),
        number,
        timestamp,
      }))
    );

export const getBlockWithNumber = async (number: number, hash: string): Promise<Block | null> =>
  txdb
    .oneOrNone(
      `
        SELECT
          blocks.hash,
          blocks.timestamp
        FROM blocks
        WHERE blocks.number = $/number/
          AND blocks.hash != $/hash/
      `,
      {
        hash: toBuffer(hash),
        number,
      }
    )
    .then((result) =>
      result
        ? {
            hash: fromBuffer(result.hash),
            number,
            timestamp: result.timestamp,
          }
        : null
    );
