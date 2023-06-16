import { Interface } from "@ethersproject/abi";
import { HashZero } from "@ethersproject/constants";
import { Contract } from "@ethersproject/contracts";
import * as Sdk from "@reservoir0x/sdk";

import { idb, pgp } from "@/common/db";
import { baseProvider } from "@/common/provider";
import { toBuffer } from "@/common/utils";
import { config } from "@/config/index";

export const isOpen = async (conduitKey: string, channel: string): Promise<boolean> => {
  if (conduitKey === HashZero) {
    return true;
  }

  const result = await idb.oneOrNone(
    `
      SELECT 1 FROM seaport_conduit_open_channels
      WHERE seaport_conduit_open_channels.conduit_key = $/conduitKey/
        AND seaport_conduit_open_channels.channel = $/channel/
    `,
    {
      conduitKey: toBuffer(conduitKey),
      channel: toBuffer(channel),
    }
  );

  return Boolean(result);
};

export const refresh = async (conduit: string) => {
  const conduitController = new Contract(
    Sdk.SeaportBase.Addresses.ConduitController[config.chainId],
    new Interface([
      "function getKey(address conduit) view returns (bytes32 conduitKey)",
      "function getChannels(address conduit) view returns (address[] channels)",
    ]),
    baseProvider
  );

  const conduitKey = await conduitController
    .getKey(conduit)
    .then((key: string) => key.toLowerCase());
  const channels = await conduitController
    .getChannels(conduit)
    .then((channels: string[]) => channels.map((c) => c.toLowerCase()));

  const columns = new pgp.helpers.ColumnSet(["conduit_key", "channel"], {
    table: "seaport_conduit_open_channels",
  });
  const values = channels.map((channel: string) => {
    return {
      conduit_key: toBuffer(conduitKey),
      channel: toBuffer(channel),
    };
  });

  await idb.none(
    `
      DELETE FROM seaport_conduit_open_channels
      WHERE seaport_conduit_open_channels.conduit_key = $/conduitKey/
        AND seaport_conduit_open_channels.channel NOT IN ($/channels:list/)
    `,
    {
      conduitKey: toBuffer(conduitKey),
      channels: values.map((c: { channel: Buffer }) => c.channel),
    }
  );

  if (values.length) {
    await idb.none(
      `
        INSERT INTO seaport_conduit_open_channels (
          conduit_key,
          channel
        ) VALUES ${pgp.helpers.values(values, columns)}
        ON CONFLICT DO NOTHING
      `
    );
  }
};
