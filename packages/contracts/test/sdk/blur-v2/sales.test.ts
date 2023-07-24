/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable no-console */

import { expect } from "chai";
import chalk from "chalk";
import * as indexerHelper from "../../indexer-helper";
import { reset } from "../../utils";

describe("Blur V2 - Sales Parsing", () => {

  beforeEach(async () => {
    // Reset Indexer
    await indexerHelper.reset();
  });

  afterEach(async () => {
    await reset();
  });

  const skipProcessing = true;

  it("takeBid", async () => {
    const parseResult = await indexerHelper.doEventParsing("0xaaceff9da025c8a790c400024b07e804108aace39a247a614e9f49c91474bd8b", skipProcessing);
    const fillEvents = parseResult.onChainData[0]?.fillEvents ?? [];
    const fillEvent = fillEvents.find((c: any) => c.tokenId === "10208");
    expect(fillEvents.length).be.eq(3)
    expect(fillEvent).not.be.eq(undefined);
    expect(fillEvent.orderSide).be.eq("buy");
  });

  it("takeBidSingle", async () => {
    const parseResult = await indexerHelper.doEventParsing("0xbc0182f06c7cf9e9edaa7d8c161b3eea67a65ecf965acaf5231248c932f036e6", skipProcessing);
    const fillEvents = parseResult.onChainData[0]?.fillEvents ?? [];
    const fillEvent = fillEvents.find((c: any) => c.tokenId === "2342");
    expect(fillEvent).not.be.eq(undefined);
    expect(fillEvent.orderSide).be.eq("buy");
    expect(fillEvent.maker).be.eq("0xe60458f765bc61e78940c5a275e9523d1f049690");
  });

  it("takeAsk", async () => {
    const parseResult = await indexerHelper.doEventParsing("0x389624a45f03bc21fd12aed6c6aed7f4f0f31cf5d56b2e25542be68019965f52", skipProcessing);
    const fillEvents = parseResult.onChainData[0]?.fillEvents ?? [];
    const fillEvent = fillEvents.find((c: any) => c.tokenId === "16276");
    expect(fillEvents.length).be.eq(2)
    expect(fillEvent).not.be.eq(undefined);
    expect(fillEvent.orderSide).be.eq("sell");
    expect(fillEvent.maker).be.eq("0xd42787bf70ca6c46bad3cc8edf7de2e2524e6628");
  });

  it("takeAskSingle", async () => {
    const parseResult = await indexerHelper.doEventParsing("0x2b66d5afd2f77af8afe803dbc44fcbbee0eb961fd1294ee399561615e024496b", skipProcessing);
    const fillEvents = parseResult.onChainData[0]?.fillEvents ?? [];
    const fillEvent = fillEvents.find((c: any) => c.tokenId === "8222");
    expect(fillEvent).not.be.eq(undefined);
    expect(fillEvent.orderSide).be.eq("sell");
    expect(fillEvent.maker).be.eq("0x6f7ce10cf9335216f63f37f15d6734a1d417db92");
  });
  
});
