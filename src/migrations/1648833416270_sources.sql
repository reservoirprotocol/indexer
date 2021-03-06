-- Up Migration

CREATE TABLE "sources" (
  "source_id" TEXT NOT NULL,
  "metadata" JSONB NOT NULL
);

ALTER TABLE "sources"
  ADD CONSTRAINT "sources_pk"
  PRIMARY KEY ("source_id");

INSERT INTO "sources" (source_id, metadata)
VALUES('0x5b3256965e7c3cf26e11fcaf296dfc8807c01073', '{"id":"0x5b3256965e7c3cf26e11fcaf296dfc8807c01073","name":"OpenSea","icon":"https://opensea.io/static/images/logos/opensea.svg","urlMainnet":"https://opensea.io/assets/${contract}/${tokenId}","urlRinkeby":"https://testnets.opensea.io/assets/${contract}/${tokenId}"}');

INSERT INTO "sources" (source_id, metadata)
VALUES('0xfdfda3d504b1431ea0fd70084b1bfa39fa99dcc4', '{"id":"0xfdfda3d504b1431ea0fd70084b1bfa39fa99dcc4","name":"Forgotten Market","icon":"https://forgotten.market/static/img/favicon.ico","urlMainnet":"https://forgotten.market/${contract}/${tokenId}","urlRinkeby":"https://forgotten.market/${contract}/${tokenId}"}');

INSERT INTO "sources" (source_id, metadata)
VALUES('0x5924a28caaf1cc016617874a2f0c3710d881f3c1', '{"id":"0x5924a28caaf1cc016617874a2f0c3710d881f3c1","name":"LooksRare","icon":"https://docs.looksrare.org/img/favicon.ico","urlMainnet":"https://looksrare.org/collections/${contract}/${tokenId}","urlRinkeby":"https://rinkeby.looksrare.org/collections/${contract}/${tokenId}"}');

-- Down Migration

DROP TABLE "sources";
