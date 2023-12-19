import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();

import { describe, expect, it, jest } from "@jest/globals";
import { Network } from "@reservoir0x/sdk/dist/utils";

import { config } from "../../config";
import * as TitlesXYZ from "../../orderbook/mints/calldata/detector/titlesxyz";

jest.setTimeout(60 * 1000);

if (config.chainId === Network.Zora) {
  describe("Mints - TitlesXYZ", () => {
    /*
      Network: ZORA

      Factory:
      emit EditionPublished({
        creator: msg.sender,
        remixContractAddress: remixClone,
        creatorProceedRecipient: proceedRecipient,
        derivativeFeeRecipient: feeRecipient
      });

      EditionsV1:
      function purchase(uint256 quantity) external payable;

      Non editable:
      function price() external view (uint256)
      function maxSupply() external view (uint256)
      function mintLimitPerWallet() external view (uint256)
      function saleEndTime() external view (uint256)
    */

    it("mint", async () => {
      const collection = "0xa279af774a0dd6c88f4a330c9cc7dd7d22594454";
      const results = await TitlesXYZ.extractByCollectionERC721(collection);
      expect(results.length).not.toBe(0);
    });

    it("detects by tx", async () => {
      const transactions = ["0xdb9b312f673c97897504e3ebb9e5c76874a945213e9778380ff31dc6443e1f5e"];

      for (const txHash of transactions) {
        const transaction = await utils.fetchTransaction(txHash);
        const results = await TitlesXYZ.extractByTx(transaction.to, transaction);
        expect(results.length).not.toBe(0);
        expect(results[0].status).toBe("open");
      }
    });
  });
}
