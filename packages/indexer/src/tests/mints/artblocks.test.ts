import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();

import { describe, expect, it, jest } from "@jest/globals";
import { Network } from "@reservoir0x/sdk/dist/utils";

import { config } from "../../config";
import { extractByCollectionERC721 } from "../../orderbook/mints/calldata/detector/artblocks";
import type { Info } from "../../orderbook/mints/calldata/detector/artblocks";

jest.setTimeout(60 * 1000);

if (config.chainId === Network.Ethereum) {
  describe("Mints - ArtBlocks", () => {
    // Flow of project creation / mints:
    // User -> MinterTypedContract -> MinterFilter -> CollectionContract

    // Project is created on CollectionContract
    // event is ProjectUpdated(projectId, FIELD_PROJECT_CREATED);

    // Project is activated / deactivate on the CollecitonContract
    // event is ProjectUpdated(projectId, FIELD_PROJECT_ACTIVE);

    // Project minting is paused / unpaused on the CollectionContract
    // event is ProjectUpdated(_projectId, FIELD_PROJECT_PAUSED);

    // Project Minter is set on MinterFilter
    // event is ProjectMinterRegistered(_projectId, _minterAddress, IFilteredMinterV0(_minterAddress).minterType());

    // Project Minter is removed on MinterFilter
    // event is ProjectMinterRemoved(_projectId);

    // Project price is configured on MinterTypedContract

    // MinterSetPriceV4 0x234b25288011081817b5cc199c3754269ccb76d2
    // When price is changed, event is  PricePerTokenInWeiUpdated(_projectId, _pricePerTokenInWei);

    // MinterDAExpSettlementV1 0xfdE58c821D1c226b4a45c22904de20b114EDe7E7
    // emit SetAuctionDetails( _projectId, _auctionTimestampStart, _priceDecayHalfLifeSeconds, _startPrice, _basePrice );

    // MinterMerkleV5 0xB8Bd1D2836C466DB149f665F777928bEE267304d
    // allowlist
    // emit PricePerTokenInWeiUpdated(_projectId, _pricePerTokenInWei);
    // @TODO: ask artblocks where to get the merkletree?

    // whenever we have an event to:
    // - create a project
    // - set the minter for a projectId
    // - activate / deactivate projectId
    // - pause / unpause projectId
    // - set price for projectId
    // THEN
    // - call extractByCollectionERC721(collection, {
    //    projectId
    //    daConfig?: DAInfoConfig
    //  })

    // old minter contract: 0x0e8bd86663e3c2418900178e96e14c51b2859957

    // const artblocksv0 = '0x059edd72cd353df5106d2b9cc5ab83a52287ac3a';
    // const artblocksv1 = '0xa7d8d9ef8d8ce8992df33d8b8cf4aebabd5bd270';

    it("set-price-minter-v4", async () => {
      const artblocksCurated = "0x99a9b7c1116f9ceeb1652de04d5969cce509b069";
      const results = await extractByCollectionERC721(artblocksCurated, {
        projectId: 484,
      });

      expect(results.length).not.toBe(0);
    });

    it("da-exp-settlement-v1", async () => {
      const artblocksCurated = "0x99a9b7c1116f9ceeb1652de04d5969cce509b069";
      {
        const results = await extractByCollectionERC721(artblocksCurated, {
          projectId: 482,
        });
        expect(results.length).not.toBe(0);
        expect(results[0].statusReason).toBe("max-supply-exceeded");
      }
      {
        const results = await extractByCollectionERC721(artblocksCurated, {
          projectId: 483,
        });

        expect(results.length).not.toBe(0);
        expect(results[0].statusReason).toBe("max-supply-exceeded");

        const daInfo: Info = results[0].details.info as Info;
        expect(daInfo.daConfig).toMatchObject({
          timestampStart: 1700676050,
          priceDecayHalfLifeSeconds: 804,
          startPrice: "4000000000000000000",
          basePrice: "190000000000000000",
        });
      }
      {
        const results = await extractByCollectionERC721(artblocksCurated, {
          projectId: 433,
        });

        expect(results.length).not.toBe(0);
        expect(results[0].status).toBe("open");

        const daInfo: Info = results[0].details.info as Info;
        expect(daInfo.daConfig).toMatchObject({
          timestampStart: 1682528400,
          priceDecayHalfLifeSeconds: 638,
          startPrice: "10000000000000000000",
          basePrice: "200000000000000000",
        });
      }
    });

    it("extracts by tx", async () => {
      const artblocksCurated = "0x99a9b7c1116f9ceeb1652de04d5969cce509b069";

      const transactions = [
        "0x6adde54ff52c78b69e9dfb8e9fde1bd5921a642467ef327d17e8c16e5e2fcf47",
        "0x9a8456d21425b5e49d6c3d15d57b22e8ca3eb2d315947762ed30ed0a38c4eb7d",
      ];

      for (const txHash of transactions) {
        const transcation = await utils.fetchTransaction(txHash);
        const results = await ArtBlocks.extractByTx(artblocksCurated, transcation);
        expect(results.length).not.toBe(0);
      }
    });
  });
}
