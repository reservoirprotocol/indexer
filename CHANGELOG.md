# [5.139.0](https://github.com/reservoirprotocol/indexer/compare/v5.138.1...v5.139.0) (2022-08-02)


### Features

* allow bidding directly on token sets ([adb38ab](https://github.com/reservoirprotocol/indexer/commit/adb38ab587de5aa6d0e1dc38839b2f5464d25fa7))



## [5.138.1](https://github.com/reservoirprotocol/indexer/compare/v5.138.0...v5.138.1) (2022-08-02)


### Bug Fixes

* consistent handling of zeroex-v4 fill events ([f149ae7](https://github.com/reservoirprotocol/indexer/commit/f149ae7b1fa23608d544f01f95d9b7cfb563ce3c))



# [5.138.0](https://github.com/reservoirprotocol/indexer/compare/v5.137.0...v5.138.0) (2022-08-01)


### Features

* get marketplaces ([c9612ab](https://github.com/reservoirprotocol/indexer/commit/c9612ab78858477e6a937e7c506216f7271142a4))



# [5.137.0](https://github.com/reservoirprotocol/indexer/compare/v5.136.1...v5.137.0) (2022-08-01)


### Bug Fixes

* add default source and attribution ([eede652](https://github.com/reservoirprotocol/indexer/commit/eede65218f9756ad6b3c8d59199cd49a82bc6de8))
* fixed build errors ([8d66c8a](https://github.com/reservoirprotocol/indexer/commit/8d66c8a4a91db562747c399d09e044a40dffbb49))


### Features

* first commit ([88a6464](https://github.com/reservoirprotocol/indexer/commit/88a64646edd0a27decf831ae980f97e0d3310734))



## [5.136.1](https://github.com/reservoirprotocol/indexer/compare/v5.136.0...v5.136.1) (2022-08-01)


### Performance Improvements

* only put fillable orders on the queue ([b340454](https://github.com/reservoirprotocol/indexer/commit/b3404546a0a833f9ef25dc223cdc3b9bcf81863a))



# [5.136.0](https://github.com/reservoirprotocol/indexer/compare/v5.135.0...v5.136.0) (2022-08-01)


### Features

* sort tokens/v4 by floor ask price ([f84933a](https://github.com/reservoirprotocol/indexer/commit/f84933a17b74e9b3213e34e81da7bb1d786741dd))
* sort tokens/v4 by floor ask price ([2e9cd8c](https://github.com/reservoirprotocol/indexer/commit/2e9cd8c72baff9b65059b4fc3385ea70742bcca1))



# [5.135.0](https://github.com/reservoirprotocol/indexer/compare/v5.134.1...v5.135.0) (2022-08-01)


### Features

* disabled exception ([#1355](https://github.com/reservoirprotocol/indexer/issues/1355)) ([9c003cb](https://github.com/reservoirprotocol/indexer/commit/9c003cb02777f4af539a34c7151ad7f38aa6095e))



## [5.134.1](https://github.com/reservoirprotocol/indexer/compare/v5.134.0...v5.134.1) (2022-08-01)


### Bug Fixes

* handle no orders available for simulation case ([5b2fe7d](https://github.com/reservoirprotocol/indexer/commit/5b2fe7dd4a511bf1cb714023788da0b2062a8cf9))



# [5.134.0](https://github.com/reservoirprotocol/indexer/compare/v5.133.0...v5.134.0) (2022-08-01)


### Bug Fixes

* backfill script query ([8065732](https://github.com/reservoirprotocol/indexer/commit/80657321eeb7aae00814fff4ba62e586201a0853))
* backfill script query ([db31a4d](https://github.com/reservoirprotocol/indexer/commit/db31a4d914e3cffc801da12f35fe959557657aca))
* minor tweaks ([ef371b1](https://github.com/reservoirprotocol/indexer/commit/ef371b118af8da3733fec7ee1af8a7871e8e6361))
* minor tweaks ([da6c5fa](https://github.com/reservoirprotocol/indexer/commit/da6c5fab5ff1c351763e7927200973efd8c560e8))
* remove more source id relics ([963cc95](https://github.com/reservoirprotocol/indexer/commit/963cc95a2f7573d5ca290c04201f0780d3bbd706))
* remove some more unused apis and port everything to the new source id ([7ffc7a7](https://github.com/reservoirprotocol/indexer/commit/7ffc7a75963308199970b276ee33d2f05517785c))
* restructure source handling and remove some unused apis ([bbdcc79](https://github.com/reservoirprotocol/indexer/commit/bbdcc79d024c8b0a569c95d7bf6b0803769badb0))
* update lock name ([b676a8c](https://github.com/reservoirprotocol/indexer/commit/b676a8c081a55bb9ad501c51d26b2a8f9738ae9f))


### Features

* create backfill job for manually cancel all wyvern v2.3 orders ([309c161](https://github.com/reservoirprotocol/indexer/commit/309c161c1c8ebfcb84a264bb29e154dca938069f))



# [5.133.0](https://github.com/reservoirprotocol/indexer/compare/v5.132.3...v5.133.0) (2022-07-31)


### Features

* completely get rid of tenderly for tx simulation ([b81203a](https://github.com/reservoirprotocol/indexer/commit/b81203ac599dbc648022e91c0c206c6821de0f54))



## [5.132.3](https://github.com/reservoirprotocol/indexer/compare/v5.132.2...v5.132.3) (2022-07-30)


### Performance Improvements

* optimize optimism rpc calls ([8ce7630](https://github.com/reservoirprotocol/indexer/commit/8ce763031de6fae5a6616866db320202e61d50e9))



## [5.132.2](https://github.com/reservoirprotocol/indexer/compare/v5.132.1...v5.132.2) (2022-07-30)


### Performance Improvements

* increase block batch size on rinkeby ([7267d7d](https://github.com/reservoirprotocol/indexer/commit/7267d7dd48705fd6c1e5d8ab8700474bf030785c))



## [5.132.1](https://github.com/reservoirprotocol/indexer/compare/v5.132.0...v5.132.1) (2022-07-30)


### Bug Fixes

* tweaks ([11f283a](https://github.com/reservoirprotocol/indexer/commit/11f283adbfa34929ec6a0c8a994b5eeb2c818b05))



# [5.132.0](https://github.com/reservoirprotocol/indexer/compare/v5.131.6...v5.132.0) (2022-07-29)


### Features

* return last buys from explore api ([35693d1](https://github.com/reservoirprotocol/indexer/commit/35693d115a17656b4c9635a689201182dd18d966))



## [5.131.6](https://github.com/reservoirprotocol/indexer/compare/v5.131.5...v5.131.6) (2022-07-29)


### Bug Fixes

* change lock name ([83c8049](https://github.com/reservoirprotocol/indexer/commit/83c8049b664cac79e4ca6b432173acd33d5b33db))



## [5.131.5](https://github.com/reservoirprotocol/indexer/compare/v5.131.4...v5.131.5) (2022-07-29)


### Bug Fixes

* change lock name ([b7fff12](https://github.com/reservoirprotocol/indexer/commit/b7fff1276c8d4d4fce168cd0f7c25c9b47930ae2))



## [5.131.4](https://github.com/reservoirprotocol/indexer/compare/v5.131.3...v5.131.4) (2022-07-29)


### Bug Fixes

* change lock name ([208966d](https://github.com/reservoirprotocol/indexer/commit/208966df505371c7263f50d80b4a7e7b4aefce05))



## [5.131.3](https://github.com/reservoirprotocol/indexer/compare/v5.131.2...v5.131.3) (2022-07-29)


### Bug Fixes

* proper attribution handling ([a01779d](https://github.com/reservoirprotocol/indexer/commit/a01779d4e501c156ade4571fa2044474a8419830))



## [5.131.2](https://github.com/reservoirprotocol/indexer/compare/v5.131.1...v5.131.2) (2022-07-29)


### Bug Fixes

* backfill wrong looksrare order side ([9e5cd5a](https://github.com/reservoirprotocol/indexer/commit/9e5cd5abb8cacaa5fd47fb02215b3b1eb0453b7c))



## [5.131.1](https://github.com/reservoirprotocol/indexer/compare/v5.131.0...v5.131.1) (2022-07-29)


### Bug Fixes

* add new index on transactions table ([9119ee8](https://github.com/reservoirprotocol/indexer/commit/9119ee8af735b44ee0b6f1c70ce20efa4a8edab2))
* delay newly minted tokens metadata by 1 minute ([a66a412](https://github.com/reservoirprotocol/indexer/commit/a66a412bd55e45ea04062d7019f9009ec0261259))



# [5.131.0](https://github.com/reservoirprotocol/indexer/compare/v5.130.0...v5.131.0) (2022-07-28)


### Features

* allow to edit the source icon/title ([25b1cda](https://github.com/reservoirprotocol/indexer/commit/25b1cda682c9d2b914e072b360ccbb248ed39b14))



# [5.130.0](https://github.com/reservoirprotocol/indexer/compare/v5.129.2...v5.130.0) (2022-07-28)


### Features

* added api to get multiple users activity ([0f8e6eb](https://github.com/reservoirprotocol/indexer/commit/0f8e6eb651dc19b1d7efb29f5d23a58432022cf6))



## [5.129.2](https://github.com/reservoirprotocol/indexer/compare/v5.129.1...v5.129.2) (2022-07-28)


### Bug Fixes

* tweaks ([7320a58](https://github.com/reservoirprotocol/indexer/commit/7320a58b72ffcea8ce30852c47c062e41edd9285))



## [5.129.1](https://github.com/reservoirprotocol/indexer/compare/v5.129.0...v5.129.1) (2022-07-28)


### Bug Fixes

* minor tweaks ([9224c3f](https://github.com/reservoirprotocol/indexer/commit/9224c3f005d8f21f83ccdd6f49d9c102b28c5f5f))
* tweaks ([00706a4](https://github.com/reservoirprotocol/indexer/commit/00706a4eb767e642d245f6aa950168542c04324b))



# [5.129.0](https://github.com/reservoirprotocol/indexer/compare/v5.128.4...v5.129.0) (2022-07-28)


### Features

* added admin api to resync source ([cdfd508](https://github.com/reservoirprotocol/indexer/commit/cdfd508d7bced123699d0bf179196fe45c4cb650))
* fetch sources icon and title and reload them ([ef08ab4](https://github.com/reservoirprotocol/indexer/commit/ef08ab45b66090c513e3a1565e01a91a25ab20a1))
* fix pubsub ([aa803fc](https://github.com/reservoirprotocol/indexer/commit/aa803fcda386d10f3d5607682bbc147de878c07e))
* fix pubsub ([cf8d53e](https://github.com/reservoirprotocol/indexer/commit/cf8d53ecd286a5e832944e5c123c15e837739c2d))
* new connection for redis subscriber ([14a0a01](https://github.com/reservoirprotocol/indexer/commit/14a0a0166c8028386bc1bbdecfb49a8f87d4ed0f))
* update events name ([bf95f4b](https://github.com/reservoirprotocol/indexer/commit/bf95f4bc05c2baade970a58dc889180e76464e72))
* update source ([a039339](https://github.com/reservoirprotocol/indexer/commit/a039339ad5c88b51b91435082542aa3223075976))
* wip ([5451aed](https://github.com/reservoirprotocol/indexer/commit/5451aed88350e7a757cc9c6aa677b4fd6974d440))



## [5.128.4](https://github.com/reservoirprotocol/indexer/compare/v5.128.3...v5.128.4) (2022-07-28)


### Bug Fixes

* use default source for fill events on backfill ([09ddcda](https://github.com/reservoirprotocol/indexer/commit/09ddcda1a0b15c842764db8eca578dac3ece09dd))



## [5.128.3](https://github.com/reservoirprotocol/indexer/compare/v5.128.2...v5.128.3) (2022-07-28)


### Bug Fixes

* by default exclude private orders from the asks api ([4849cab](https://github.com/reservoirprotocol/indexer/commit/4849caba4230b07acd3531cb0996fc10f908ae39))



## [5.128.2](https://github.com/reservoirprotocol/indexer/compare/v5.128.1...v5.128.2) (2022-07-28)


### Bug Fixes

* debug failing backfill ([d3cd0f3](https://github.com/reservoirprotocol/indexer/commit/d3cd0f3f592c943ca0bc34bd714d2c25a8abc4e0))



## [5.128.1](https://github.com/reservoirprotocol/indexer/compare/v5.128.0...v5.128.1) (2022-07-28)


### Bug Fixes

* activity apis validation errors ([39ca5de](https://github.com/reservoirprotocol/indexer/commit/39ca5de6d573d1be19d2c85ef35d6f74b82d7cbf))



# [5.128.0](https://github.com/reservoirprotocol/indexer/compare/v5.127.0...v5.128.0) (2022-07-28)


### Features

* backfill new fill and aggregator source columns ([2788d00](https://github.com/reservoirprotocol/indexer/commit/2788d003a85fdf0c0141655e4fad113fd00df12d))



# [5.127.0](https://github.com/reservoirprotocol/indexer/compare/v5.126.0...v5.127.0) (2022-07-27)


### Bug Fixes

* return source domain ([1dccb29](https://github.com/reservoirprotocol/indexer/commit/1dccb2919af5f1e908759db54c18d347d8b5cd90))
* return source domain ([34b61ed](https://github.com/reservoirprotocol/indexer/commit/34b61ed8b09eae24559e4ed70a1e532d849e4f1c))


### Features

* on conflict domain ([e5b35c7](https://github.com/reservoirprotocol/indexer/commit/e5b35c76d3e562e0cbcf4f564ded9009814f52b6))
* update no token found to warning ([5783004](https://github.com/reservoirprotocol/indexer/commit/578300481e9855a4d2bb43264ea51833994bc259))



# [5.126.0](https://github.com/reservoirprotocol/indexer/compare/v5.125.0...v5.126.0) (2022-07-27)


### Features

* backfill transactions from missing block range ([4956060](https://github.com/reservoirprotocol/indexer/commit/4956060718688ccb7a6b0188cd764d5e8a5fc5b4))
* collections sets endpoint with owners dist ([53e812f](https://github.com/reservoirprotocol/indexer/commit/53e812fc312f6fbaf32d59b29e0deba1f445cae9))



# [5.125.0](https://github.com/reservoirprotocol/indexer/compare/v5.124.0...v5.125.0) (2022-07-27)


### Features

* integrated sources v3 ([3818c77](https://github.com/reservoirprotocol/indexer/commit/3818c777afa76d2aa67b83107952e05f65336aba))



# [5.124.0](https://github.com/reservoirprotocol/indexer/compare/v5.123.0...v5.124.0) (2022-07-27)


### Bug Fixes

* don't return defaults ([b8ca0da](https://github.com/reservoirprotocol/indexer/commit/b8ca0da6fd803d8a2cc7ce9e52a9371468031c41))
* don't return defaults ([3ca4ecc](https://github.com/reservoirprotocol/indexer/commit/3ca4eccb61975905bf820bbfb42ab3c06b1c0409))
* search for domains ([10308ea](https://github.com/reservoirprotocol/indexer/commit/10308ea59f6405960802cf9f861e9522ffd88224))


### Features

* add collectionsSetId as get-owners query param ([f21f8cc](https://github.com/reservoirprotocol/indexer/commit/f21f8cc3aeb69ea560db74dc2cd103738ba862a5))
* added support for sources by domain ([b20eb2d](https://github.com/reservoirprotocol/indexer/commit/b20eb2df2d6837e72c3c25f88e9b19b0a730c250))
* update events utils ([f341afe](https://github.com/reservoirprotocol/indexer/commit/f341afeaf6ecd05c0a6af1204c738b289f590606))
* update order v3 ([0d9c80d](https://github.com/reservoirprotocol/indexer/commit/0d9c80d43edb6ca386f1240d297fb43b844c95ff))
* update sources.json ([cd1ad64](https://github.com/reservoirprotocol/indexer/commit/cd1ad64248d68bd25b86de3d22f194fe3c40a6f8))



# [5.123.0](https://github.com/reservoirprotocol/indexer/compare/v5.122.0...v5.123.0) (2022-07-27)


### Features

* add support for cancelling x2y2 orders ([6ea4e11](https://github.com/reservoirprotocol/indexer/commit/6ea4e11fb424dd54d381418c1e4a1174b7799534))



# [5.122.0](https://github.com/reservoirprotocol/indexer/compare/v5.121.0...v5.122.0) (2022-07-27)


### Features

* add reorg-resistant sale id ([7a3a809](https://github.com/reservoirprotocol/indexer/commit/7a3a809c135d9a9d969fb21d5fa55b56b6273075))



# [5.121.0](https://github.com/reservoirprotocol/indexer/compare/v5.120.6...v5.121.0) (2022-07-27)


### Bug Fixes

* disable aggregator and fill source detection until sources v3 is live ([8b4430f](https://github.com/reservoirprotocol/indexer/commit/8b4430fbe30aad89910a88c645ec9819031fb69a))
* order source defaulting ([4d3efe9](https://github.com/reservoirprotocol/indexer/commit/4d3efe99dbc3651bd545ea8ccce489e24470da82))
* seaport conduit on non-opensea chains ([6fe8b04](https://github.com/reservoirprotocol/indexer/commit/6fe8b04072be6daeda6433f436d01a2e36734100))


### Features

* add support for checking transaction status and retrieving sales by transaction ([648b62a](https://github.com/reservoirprotocol/indexer/commit/648b62a38de3767b410299d79c953eee48412f1d))
* allow forcing all fills to go through the router ([1d11fc3](https://github.com/reservoirprotocol/indexer/commit/1d11fc3bf8e95f07449e175ef287bb8709676526))
* improved execute list and bid apis ([6341301](https://github.com/reservoirprotocol/indexer/commit/6341301fdfddcdf1dbe47c37b1610b02dd78008f))
* integrate aggregator and fill sources ([f2c89c2](https://github.com/reservoirprotocol/indexer/commit/f2c89c2c7320b5467584f487b9ba1835f8c75e3f))
* minor improvements to the execute apis ([ac64140](https://github.com/reservoirprotocol/indexer/commit/ac64140da2a876c3970eca4d6eecef56731315f4))
* refactor execute apis ([348173b](https://github.com/reservoirprotocol/indexer/commit/348173be77d10274145adb31766d75cd4fe2dd78))
* update domain regex ([64a4f34](https://github.com/reservoirprotocol/indexer/commit/64a4f342c5b5ae66cf4280fc23740c13740f5bc6))



## [5.120.6](https://github.com/reservoirprotocol/indexer/compare/v5.120.5...v5.120.6) (2022-07-27)


### Bug Fixes

* query ([8a7379c](https://github.com/reservoirprotocol/indexer/commit/8a7379c4ef9e4819562a0398b9d1613e31d86290))



## [5.120.5](https://github.com/reservoirprotocol/indexer/compare/v5.120.4...v5.120.5) (2022-07-27)


### Bug Fixes

* better zeroex-v4/opendao order nonce handling ([dbd03fe](https://github.com/reservoirprotocol/indexer/commit/dbd03feb51e69429d0e01fea8b18fa58dfbd605f))



## [5.120.4](https://github.com/reservoirprotocol/indexer/compare/v5.120.3...v5.120.4) (2022-07-26)


### Bug Fixes

* looksrare order cross-posting ([56f1d4f](https://github.com/reservoirprotocol/indexer/commit/56f1d4fc4ba732f5beb6d70ac7a626f7bc3a30f9))



## [5.120.3](https://github.com/reservoirprotocol/indexer/compare/v5.120.2...v5.120.3) (2022-07-25)


### Bug Fixes

* add one more block orphan check job ([4a36717](https://github.com/reservoirprotocol/indexer/commit/4a3671775321c4e0f7a674f247589b4cb4e0bd55))



## [5.120.2](https://github.com/reservoirprotocol/indexer/compare/v5.120.1...v5.120.2) (2022-07-25)


### Bug Fixes

* block orphan checking ([ae9cca1](https://github.com/reservoirprotocol/indexer/commit/ae9cca1466b14c4471bc571200b5ec4109e4e040))
* use default chain id configs ([2ee84e8](https://github.com/reservoirprotocol/indexer/commit/2ee84e8e60b3b915a8b5e446741a3eedd244c307))



## [5.120.1](https://github.com/reservoirprotocol/indexer/compare/v5.120.0...v5.120.1) (2022-07-25)


### Bug Fixes

* more resilient orphan block check ([4eea30f](https://github.com/reservoirprotocol/indexer/commit/4eea30f9f3411aaa4103303e663d381982e673b9))



# [5.120.0](https://github.com/reservoirprotocol/indexer/compare/v5.119.0...v5.120.0) (2022-07-23)


### Bug Fixes

* allow unsafe number for amount ([7d67c7f](https://github.com/reservoirprotocol/indexer/commit/7d67c7f508fc1db4d70c5aa253d759e4ff66474d))



# [5.119.0](https://github.com/reservoirprotocol/indexer/compare/v5.118.3...v5.119.0) (2022-07-22)


### Features

* allow passing source in the execute apis ([1bb1a98](https://github.com/reservoirprotocol/indexer/commit/1bb1a9853995786662c1394bd90f4ded63b61d1d))



## [5.118.3](https://github.com/reservoirprotocol/indexer/compare/v5.118.2...v5.118.3) (2022-07-20)


### Bug Fixes

* debug logs ([d678d31](https://github.com/reservoirprotocol/indexer/commit/d678d3156cf9ae2139db994b1be545039206ecb7))



## [5.118.2](https://github.com/reservoirprotocol/indexer/compare/v5.118.1...v5.118.2) (2022-07-20)


### Bug Fixes

* fallback to on-chain data retrieval when no transaction is available ([e26f45d](https://github.com/reservoirprotocol/indexer/commit/e26f45d1380d2568a0a33f68202181d1ac2f9e6d))



## [5.118.1](https://github.com/reservoirprotocol/indexer/compare/v5.118.0...v5.118.1) (2022-07-20)


### Bug Fixes

* various tweaks ([c289299](https://github.com/reservoirprotocol/indexer/commit/c289299abe4f88210b7bad0edd6afcdce3fde664))



# [5.118.0](https://github.com/reservoirprotocol/indexer/compare/v5.117.0...v5.118.0) (2022-07-20)


### Bug Fixes

* use :csv instead of :raw ([e09bee0](https://github.com/reservoirprotocol/indexer/commit/e09bee078634947ce581db9fb8e5457fdc70d3dc))


### Features

* add filtering for multiple values per key on tokens/details as well ([eb8aae1](https://github.com/reservoirprotocol/indexer/commit/eb8aae1efb26018e3e4ecfa36cfc3b0c0a07ca85))
* support multiple values selected per attribute ([06c865e](https://github.com/reservoirprotocol/indexer/commit/06c865e0a2f4f862cd6a86cba6cc7189b53833eb))



# [5.117.0](https://github.com/reservoirprotocol/indexer/compare/v5.116.1...v5.117.0) (2022-07-19)


### Bug Fixes

* log received transactions ([292b672](https://github.com/reservoirprotocol/indexer/commit/292b672b4f520c0cfcb0b4b6292cea72edce89c7))


### Features

* more efficient handling of transactions ([4d51036](https://github.com/reservoirprotocol/indexer/commit/4d5103684790b44986fad245661cbf8a8ab61b44))



## [5.116.1](https://github.com/reservoirprotocol/indexer/compare/v5.116.0...v5.116.1) (2022-07-18)


### Bug Fixes

* use exponential backoff for the fill events fill source backfill ([e293c2e](https://github.com/reservoirprotocol/indexer/commit/e293c2e5533097118824d4d2208b84a3fff237de))



# [5.116.0](https://github.com/reservoirprotocol/indexer/compare/v5.115.3...v5.116.0) (2022-07-17)


### Features

* require authentication for the bullmq admin dashboard ([2f7b32c](https://github.com/reservoirprotocol/indexer/commit/2f7b32c2e9d320cd413f234a130965e599987396))



## [5.115.3](https://github.com/reservoirprotocol/indexer/compare/v5.115.2...v5.115.3) (2022-07-16)


### Bug Fixes

* retry backfill ([7ac0c9c](https://github.com/reservoirprotocol/indexer/commit/7ac0c9c80049732f517e11bbddffa7c1b1b2787a))



## [5.115.2](https://github.com/reservoirprotocol/indexer/compare/v5.115.1...v5.115.2) (2022-07-16)


### Bug Fixes

* backfill fill source in descending order ([a840bc6](https://github.com/reservoirprotocol/indexer/commit/a840bc65f57db41524ebff8541f61cfd8e2e4573))



## [5.115.1](https://github.com/reservoirprotocol/indexer/compare/v5.115.0...v5.115.1) (2022-07-16)


### Bug Fixes

* stop fill source backfill ([475349c](https://github.com/reservoirprotocol/indexer/commit/475349c5e451c87b961ab1e45cdb35098c10daed))



# [5.115.0](https://github.com/reservoirprotocol/indexer/compare/v5.114.0...v5.115.0) (2022-07-15)


### Features

* read token from replica ([1b1e98f](https://github.com/reservoirprotocol/indexer/commit/1b1e98fecf8c24d34c50d94a0a4706414702f46c))



# [5.114.0](https://github.com/reservoirprotocol/indexer/compare/v5.113.4...v5.114.0) (2022-07-15)


### Features

* read token from replica ([b59da82](https://github.com/reservoirprotocol/indexer/commit/b59da82e2802524c50788af283fdf06c629e1210))



## [5.113.4](https://github.com/reservoirprotocol/indexer/compare/v5.113.3...v5.113.4) (2022-07-15)


### Bug Fixes

* joi sortBy validation when filtering by contract ([f9778b7](https://github.com/reservoirprotocol/indexer/commit/f9778b743cfe2a71ed4966e5cbd8b3501512f802))



## [5.113.3](https://github.com/reservoirprotocol/indexer/compare/v5.113.2...v5.113.3) (2022-07-15)


### Bug Fixes

* missing transaction data ([913f5a8](https://github.com/reservoirprotocol/indexer/commit/913f5a81a5e8942d8b7aad942afe5b997006e874))



## [5.113.2](https://github.com/reservoirprotocol/indexer/compare/v5.113.1...v5.113.2) (2022-07-15)


### Bug Fixes

* debug ([585e446](https://github.com/reservoirprotocol/indexer/commit/585e446a5a13aaedb8d099dcad3be113f1eb158c))



## [5.113.1](https://github.com/reservoirprotocol/indexer/compare/v5.113.0...v5.113.1) (2022-07-15)


### Bug Fixes

* debug ([35c700b](https://github.com/reservoirprotocol/indexer/commit/35c700b80d8796dad04a18003469543ef3ecdf81))



# [5.113.0](https://github.com/reservoirprotocol/indexer/compare/v5.112.14...v5.113.0) (2022-07-15)


### Features

* allow any twap interval ([0cdbd1f](https://github.com/reservoirprotocol/indexer/commit/0cdbd1f14dab5049578ef73da54504cd8b9f8e8e))



## [5.112.14](https://github.com/reservoirprotocol/indexer/compare/v5.112.13...v5.112.14) (2022-07-15)


### Bug Fixes

* tweaks ([8985c2b](https://github.com/reservoirprotocol/indexer/commit/8985c2b0158f653012891d81401b9664d80843f8))



## [5.112.13](https://github.com/reservoirprotocol/indexer/compare/v5.112.12...v5.112.13) (2022-07-15)


### Bug Fixes

* tweaks ([8bf9690](https://github.com/reservoirprotocol/indexer/commit/8bf9690e3d5d57d2e6c5cf8c304bf1c45dabed80))



## [5.112.12](https://github.com/reservoirprotocol/indexer/compare/v5.112.11...v5.112.12) (2022-07-15)


### Bug Fixes

* tweaks ([d6548b2](https://github.com/reservoirprotocol/indexer/commit/d6548b25642c4b3dbd5fb5018538e5eab9da5b2c))



## [5.112.11](https://github.com/reservoirprotocol/indexer/compare/v5.112.10...v5.112.11) (2022-07-15)


### Bug Fixes

* tweaks ([2569cfd](https://github.com/reservoirprotocol/indexer/commit/2569cfdff099685a46dea7b3005cf19c057510d2))



## [5.112.10](https://github.com/reservoirprotocol/indexer/compare/v5.112.9...v5.112.10) (2022-07-15)


### Bug Fixes

* tweaks ([8675f12](https://github.com/reservoirprotocol/indexer/commit/8675f12c5df1eb65a126449968269f91e8fa2b64))



## [5.112.9](https://github.com/reservoirprotocol/indexer/compare/v5.112.8...v5.112.9) (2022-07-15)


### Bug Fixes

* debug ([334a8fc](https://github.com/reservoirprotocol/indexer/commit/334a8fc6d68886a8c1913b4c0506c25b3ce1ece4))



## [5.112.8](https://github.com/reservoirprotocol/indexer/compare/v5.112.7...v5.112.8) (2022-07-15)


### Bug Fixes

* reenable backfill job ([f4b9b49](https://github.com/reservoirprotocol/indexer/commit/f4b9b49e086ef80708306f5161d8bf1461268f06))



## [5.112.7](https://github.com/reservoirprotocol/indexer/compare/v5.112.6...v5.112.7) (2022-07-15)


### Bug Fixes

* stop backfill ([f47f0ea](https://github.com/reservoirprotocol/indexer/commit/f47f0ea7362885cf9555cedc5595dabb160bcd03))



## [5.112.6](https://github.com/reservoirprotocol/indexer/compare/v5.112.5...v5.112.6) (2022-07-15)


### Bug Fixes

* transaction block fields update query ([99eb487](https://github.com/reservoirprotocol/indexer/commit/99eb48731d0093b3df992a26421e0c22be081e46))



## [5.112.5](https://github.com/reservoirprotocol/indexer/compare/v5.112.4...v5.112.5) (2022-07-15)


### Bug Fixes

* transaction block fields update query ([f974732](https://github.com/reservoirprotocol/indexer/commit/f974732b6f5dd5cbc54ee7fca6378f06dc05b616))



## [5.112.4](https://github.com/reservoirprotocol/indexer/compare/v5.112.3...v5.112.4) (2022-07-15)


### Bug Fixes

* backfill missing transaction fields ([daf3506](https://github.com/reservoirprotocol/indexer/commit/daf35065481085262df4e886061405c26c896e9d))



## [5.112.3](https://github.com/reservoirprotocol/indexer/compare/v5.112.2...v5.112.3) (2022-07-14)


### Bug Fixes

* revert to more efficient block ingestion ([3d822f2](https://github.com/reservoirprotocol/indexer/commit/3d822f2dc572b225b5e1c2d2756403d7a50d07bc))



## [5.112.2](https://github.com/reservoirprotocol/indexer/compare/v5.112.1...v5.112.2) (2022-07-14)


### Bug Fixes

* debug ([8dafe22](https://github.com/reservoirprotocol/indexer/commit/8dafe22986169d5cb36c11173ea90f6f6d7a515f))



## [5.112.1](https://github.com/reservoirprotocol/indexer/compare/v5.112.0...v5.112.1) (2022-07-14)


### Bug Fixes

* debug ([3856da9](https://github.com/reservoirprotocol/indexer/commit/3856da9030f9c6d03a49efd963d8cd3a936e4e38))



# [5.112.0](https://github.com/reservoirprotocol/indexer/compare/v5.111.0...v5.112.0) (2022-07-14)


### Bug Fixes

* backfill missing fill sources ([5adbdf2](https://github.com/reservoirprotocol/indexer/commit/5adbdf2598f3885624673e77ba92cce0be5c9dfe))
* debug ([f801ad6](https://github.com/reservoirprotocol/indexer/commit/f801ad641f97b2121c38ef62c192ee6d6cc0ef96))
* minor tweaks ([a69c351](https://github.com/reservoirprotocol/indexer/commit/a69c3512dda3b733d0c17d7d926057092ed24a9b))
* minor tweaks ([3a61c92](https://github.com/reservoirprotocol/indexer/commit/3a61c9201c471b4a485bf0fb985fce7230a79f61))
* minor tweaks ([18e8703](https://github.com/reservoirprotocol/indexer/commit/18e870312f97f2fad423842ec0557a09f403535e))
* minor tweaks ([4ac7736](https://github.com/reservoirprotocol/indexer/commit/4ac7736ea9aca41e4cc5f2d7f6a46f3b934022f4))
* remove debug logs ([7b32f0e](https://github.com/reservoirprotocol/indexer/commit/7b32f0e9ead3dba3c12cf492c300e2345889abe7))
* tweaks ([f4f8473](https://github.com/reservoirprotocol/indexer/commit/f4f8473f003cdd669ff88b6fd0e2f584b2098d6b))
* tweaks ([f064c97](https://github.com/reservoirprotocol/indexer/commit/f064c978997149a92842070c72c2a90e3e6af160))
* tweaks ([b9a52f4](https://github.com/reservoirprotocol/indexer/commit/b9a52f4ac4b7848ff96c3fe2137bfb8d35f91599))
* tweaks ([0fa9774](https://github.com/reservoirprotocol/indexer/commit/0fa977437d08999369688421924ada6633fd4306))
* tweaks ([d0ba026](https://github.com/reservoirprotocol/indexer/commit/d0ba026f197744ad5edb0645e275a2f91f32d64b))
* use write instance ([011d5de](https://github.com/reservoirprotocol/indexer/commit/011d5dee4b931b346d5ad7c2ba84000bb46e0c14))


### Features

* add queue for backfilling block timestamps ([f3271e1](https://github.com/reservoirprotocol/indexer/commit/f3271e173f430c3be5ad4320e49b3f2456475604))
* synchronous handling of blocks ([2c4bacf](https://github.com/reservoirprotocol/indexer/commit/2c4bacf05d665ec30c9ceb33f7a688894cc2ca8c))



# [5.111.0](https://github.com/reservoirprotocol/indexer/compare/v5.110.1...v5.111.0) (2022-07-14)


### Features

* reduce concurrency ([073d42a](https://github.com/reservoirprotocol/indexer/commit/073d42aa130a351dca2a2abd8698b99a1706473f))
* remove logs ([474a903](https://github.com/reservoirprotocol/indexer/commit/474a90341214dbd75734671850d2658a545ebc32))



## [5.110.1](https://github.com/reservoirprotocol/indexer/compare/v5.110.0...v5.110.1) (2022-07-14)


### Bug Fixes

* disallow fallback collection data in most cases ([56c2968](https://github.com/reservoirprotocol/indexer/commit/56c2968df4fad40283c34ac7f2a97dc6f3680f55))



# [5.110.0](https://github.com/reservoirprotocol/indexer/compare/v5.109.0...v5.110.0) (2022-07-14)


### Features

* properly attribute fill source across all exchanges ([19c3cc3](https://github.com/reservoirprotocol/indexer/commit/19c3cc3965328660362737105edee08d446c07f4))



# [5.109.0](https://github.com/reservoirprotocol/indexer/compare/v5.108.1...v5.109.0) (2022-07-14)


### Bug Fixes

* simulate floor api ([e908d3a](https://github.com/reservoirprotocol/indexer/commit/e908d3a39aec9600d8f9b9f48efdd7e560e1749a))


### Features

* use on-chain data for collection information ([9ed4094](https://github.com/reservoirprotocol/indexer/commit/9ed409417e721f7d3c933019da79b28a3c895cae))



## [5.108.1](https://github.com/reservoirprotocol/indexer/compare/v5.108.0...v5.108.1) (2022-07-13)


### Bug Fixes

* additional goerli settings ([2bfc89c](https://github.com/reservoirprotocol/indexer/commit/2bfc89c993facf84a9195eed0d9c4e8503036b6d))



# [5.108.0](https://github.com/reservoirprotocol/indexer/compare/v5.107.1...v5.108.0) (2022-07-13)


### Features

* added logs ([3fdefd6](https://github.com/reservoirprotocol/indexer/commit/3fdefd6c0b8a6240b696a343ded0434bce5906c2))



## [5.107.1](https://github.com/reservoirprotocol/indexer/compare/v5.107.0...v5.107.1) (2022-07-13)


### Bug Fixes

* properly detect goerli network ([4553c14](https://github.com/reservoirprotocol/indexer/commit/4553c14512a9edc6248a3b06efecce1a28c53ed6))



# [5.107.0](https://github.com/reservoirprotocol/indexer/compare/v5.106.0...v5.107.0) (2022-07-13)


### Bug Fixes

* bundle order updates by maker query ([f259961](https://github.com/reservoirprotocol/indexer/commit/f25996152164190535a6f9ffcf27bc98265cf212))
* debug ([6ac1384](https://github.com/reservoirprotocol/indexer/commit/6ac1384ceb77bfa29a69b69969696cbd3e7eb017))
* minor tweaks ([33a42d0](https://github.com/reservoirprotocol/indexer/commit/33a42d0c1783e8faf6c849db9d55cc221361fe08))
* minor tweaks ([087dc18](https://github.com/reservoirprotocol/indexer/commit/087dc18c5fcb4e9ea9b5335db52ec5f559c7d1cd))
* minor tweaks ([e041db3](https://github.com/reservoirprotocol/indexer/commit/e041db3dd5291da6e53962bb9903d0703604a205))
* minor tweaks ([01e00da](https://github.com/reservoirprotocol/indexer/commit/01e00dab202147c3821f98a6d217a6154f8e692a))
* minor tweaks ([4a6b2d6](https://github.com/reservoirprotocol/indexer/commit/4a6b2d65a6fb26096011640b452439e57e040461))
* minor tweaks ([b44d477](https://github.com/reservoirprotocol/indexer/commit/b44d47773bb9433e0e92d37a054a7f14e550fc90))
* minor tweaks ([4670d42](https://github.com/reservoirprotocol/indexer/commit/4670d42fba87ee28080f30a486cea545555290e7))
* minor tweaks ([a4ee0db](https://github.com/reservoirprotocol/indexer/commit/a4ee0db0bc872450d82c199ef8b15b7ad034db23))
* minor tweaks ([4aadca7](https://github.com/reservoirprotocol/indexer/commit/4aadca7fb18b58f1e592d08e75b703b386bb0476))
* minor tweaks ([b620be2](https://github.com/reservoirprotocol/indexer/commit/b620be24faa1b1e71623e362b23dd518a0d91671))
* minor tweaks ([65b6dfc](https://github.com/reservoirprotocol/indexer/commit/65b6dfcfd3e7bcb3ba8454af83cbb19903019c9a))
* minor tweaks ([075d59c](https://github.com/reservoirprotocol/indexer/commit/075d59ce2a967c48457c8aac83fd42dba88d978f))
* minor tweaks ([71d5199](https://github.com/reservoirprotocol/indexer/commit/71d519951921df5ff63446ef0808fa004272f1bc))
* uncomment index creation ([b904f19](https://github.com/reservoirprotocol/indexer/commit/b904f19689f240d366d67bb52ca874cdf07640e6))


### Features

* basic support for bundles ([cd0c4d3](https://github.com/reservoirprotocol/indexer/commit/cd0c4d3b309d739950ad0319abd1c66502f866c1))
* handle bundle orders approvals ([d2cd4c9](https://github.com/reservoirprotocol/indexer/commit/d2cd4c97d2436d0d13871c38b38701af2c6d58d7))
* validate bundle balances ([342a848](https://github.com/reservoirprotocol/indexer/commit/342a848c867cbf4d987f0ab59895b4ddc94d7731))



# [5.106.0](https://github.com/reservoirprotocol/indexer/compare/v5.105.1...v5.106.0) (2022-07-12)


### Bug Fixes

* check the order side for the fill event ([2e1490f](https://github.com/reservoirprotocol/indexer/commit/2e1490f5273121459be8359f49139d3ad15c4f4d))
* check the order side for the fill event and store order id ([87a773b](https://github.com/reservoirprotocol/indexer/commit/87a773b33b86de4a37648b016c7fa032f5923404))


### Features

* filter empty attributes ([7968be5](https://github.com/reservoirprotocol/indexer/commit/7968be57bcd6a534a488a26272bf3586cc66cbb4))



## [5.105.1](https://github.com/reservoirprotocol/indexer/compare/v5.105.0...v5.105.1) (2022-07-12)


### Bug Fixes

* cancelled orders confirmation ([b2f7eef](https://github.com/reservoirprotocol/indexer/commit/b2f7eef1f3d938f2ef90920b38cc1597d94f5ced))
* properly handle cancellations ([35c8c7a](https://github.com/reservoirprotocol/indexer/commit/35c8c7ab2161b45cd8b0e2fdb98e95ee18b129ef))



# [5.105.0](https://github.com/reservoirprotocol/indexer/compare/v5.104.0...v5.105.0) (2022-07-12)


### Features

* improve order execution confirmation ([cf5cd9b](https://github.com/reservoirprotocol/indexer/commit/cf5cd9b068f1d8a68bd64d2ddf68b1f022f99e5b))



# [5.104.0](https://github.com/reservoirprotocol/indexer/compare/v5.103.3...v5.104.0) (2022-07-08)


### Features

* bigger top bid batch update ([aae96ca](https://github.com/reservoirprotocol/indexer/commit/aae96caa19f14f7628a74e1a0f13cc2a87890f35))
* move calls to replica ([5e5de93](https://github.com/reservoirprotocol/indexer/commit/5e5de93c158e78e198cb70b2a72b0927d3a414c3))
* update explore and get collection to make top bid optional ([b3a927e](https://github.com/reservoirprotocol/indexer/commit/b3a927e98b9e6fe3ff3de1afcacbf67b24853471))
* update top bid batch size ([bcfef53](https://github.com/reservoirprotocol/indexer/commit/bcfef533d83c0cd7c92ee4296de9eb1ea1ca2ea3))
* update top bid batch size ([c418f29](https://github.com/reservoirprotocol/indexer/commit/c418f29366d1b492c3670ec677d7cc899870fd8b))



## [5.103.3](https://github.com/reservoirprotocol/indexer/compare/v5.103.2...v5.103.3) (2022-07-08)


### Bug Fixes

* read from writer in the order updates by id queue ([58e2d04](https://github.com/reservoirprotocol/indexer/commit/58e2d0494c77366214f33d612f930b4cb70389ba))



## [5.103.2](https://github.com/reservoirprotocol/indexer/compare/v5.103.1...v5.103.2) (2022-07-07)


### Bug Fixes

* transfers bulk api sorting ([4440264](https://github.com/reservoirprotocol/indexer/commit/4440264ed84a9d1a6aa5da4a99efd7a9d988259d))



## [5.103.1](https://github.com/reservoirprotocol/indexer/compare/v5.103.0...v5.103.1) (2022-07-06)


### Bug Fixes

* exclude large keys from query ([f9b1429](https://github.com/reservoirprotocol/indexer/commit/f9b1429a3532f31404fdb8b5166358ab5a516a79))
* move reads to replica ([8b219d1](https://github.com/reservoirprotocol/indexer/commit/8b219d1a07f7ca424398cbf2236d70f410e906dc))
* sort by token id ([610e8e1](https://github.com/reservoirprotocol/indexer/commit/610e8e165fac1f8b9de028ea561119a7304024e0))



# [5.103.0](https://github.com/reservoirprotocol/indexer/compare/v5.102.2...v5.103.0) (2022-07-06)


### Bug Fixes

* properly handle tenderly simulation reverts ([7d4749c](https://github.com/reservoirprotocol/indexer/commit/7d4749c2d0068529223a64341b3c2fa7a2fe2619))
* update order updates by maker queue concurrency ([ce35ec4](https://github.com/reservoirprotocol/indexer/commit/ce35ec4cb0571317eeafcfbad19614d2bdfbfaa0))


### Features

* add support for seaport private listings ([7280443](https://github.com/reservoirprotocol/indexer/commit/72804430c0313cd27adb52551e76adf9223aca8a))
* add transfers bulk api ([e739e70](https://github.com/reservoirprotocol/indexer/commit/e739e70d4369077f3d27e7dc4c5c8cd583e4a203))
* support private listings (non-seaport for now) ([5f79f75](https://github.com/reservoirprotocol/indexer/commit/5f79f75a7b6cd61f26629acf27631badec2c7ae3))



## [5.102.2](https://github.com/reservoirprotocol/indexer/compare/v5.102.1...v5.102.2) (2022-07-05)


### Bug Fixes

* filter collections with keys that has too many values from rarity ([5d3f00a](https://github.com/reservoirprotocol/indexer/commit/5d3f00a0f62e40bf8137ee562c4db6aa41ba92ac))
* stop creating releases ([690e237](https://github.com/reservoirprotocol/indexer/commit/690e237d0fbee04a5cc15f45858282befbff5d74))



## [5.102.1](https://github.com/reservoirprotocol/indexer/compare/v5.102.0...v5.102.1) (2022-07-05)


### Bug Fixes

* log any invalid orders ([3b80481](https://github.com/reservoirprotocol/indexer/commit/3b80481dcb58f271c5a18f57a633a9f60c6a2e69))



# [5.102.0](https://github.com/reservoirprotocol/indexer/compare/v5.101.0...v5.102.0) (2022-07-05)


### Bug Fixes

* remove explicit transactions ([4de2c99](https://github.com/reservoirprotocol/indexer/commit/4de2c996bcff19a0b9d7b97061a5efab42f62be9))
* tweaks ([4df7103](https://github.com/reservoirprotocol/indexer/commit/4df7103aac3e2a4d4237df4b0246e84edd687d3d))
* wrong query ([cb073b2](https://github.com/reservoirprotocol/indexer/commit/cb073b2da39585c5989c9768aac3307b915d98aa))


### Features

* public api for floor order simulation ([0fa55cb](https://github.com/reservoirprotocol/indexer/commit/0fa55cb6c14ae384bb4ad93e9791fab1fa62e5d0))



# [5.101.0](https://github.com/reservoirprotocol/indexer/compare/v5.100.1...v5.101.0) (2022-07-05)


### Bug Fixes

* check if collection has too many keys ([c6398bb](https://github.com/reservoirprotocol/indexer/commit/c6398bbe9fb45db9549259e29afa2f3e7543f3a0))
* revert datadog version ([8ad5934](https://github.com/reservoirprotocol/indexer/commit/8ad5934ab2458925853dfac2f2f0fcc2fcbd1c26))
* revert datadog version ([6a31273](https://github.com/reservoirprotocol/indexer/commit/6a31273135f06bf20899d9e3be60ebbea61b9686))



## [5.100.1](https://github.com/reservoirprotocol/indexer/compare/v5.100.0...v5.100.1) (2022-07-04)


### Bug Fixes

* skip seaport orders with a zero price ([2e5052d](https://github.com/reservoirprotocol/indexer/commit/2e5052d640dc77180faa3e97bf6b841c633eb146))



# [5.100.0](https://github.com/reservoirprotocol/indexer/compare/v5.99.1...v5.100.0) (2022-07-04)


### Features

* use slow provider for api rpc calls ([661be7f](https://github.com/reservoirprotocol/indexer/commit/661be7f25f1d8fa530e397133f3136141bbee8c1))



## [5.99.1](https://github.com/reservoirprotocol/indexer/compare/v5.99.0...v5.99.1) (2022-07-01)


### Bug Fixes

* properly associate x2y2 sales to transfers ([79947d2](https://github.com/reservoirprotocol/indexer/commit/79947d281694ef0225939dd7f65ba82e9873a7c2))



# [5.99.0](https://github.com/reservoirprotocol/indexer/compare/v5.98.0...v5.99.0) (2022-07-01)


### Features

* enable datadog profiling ([f58b217](https://github.com/reservoirprotocol/indexer/commit/f58b217e237367d5b72ea92841bc2747c33d6a87))
* enable profiling ([44fbcbd](https://github.com/reservoirprotocol/indexer/commit/44fbcbd8132d363b89e0c4dc109e223758e76ae6))
* update datadog ([7f1d058](https://github.com/reservoirprotocol/indexer/commit/7f1d058ede16da02a5077f6acdcedfcc4f54bbcd))



# [5.98.0](https://github.com/reservoirprotocol/indexer/compare/v5.97.1...v5.98.0) (2022-07-01)


### Features

* fetch tokens in batches for the rarity calculation ([97771e9](https://github.com/reservoirprotocol/indexer/commit/97771e9dad3338b713ac155198067be35c72b123))
* fix collection sets post ([d1635ba](https://github.com/reservoirprotocol/indexer/commit/d1635ba4beffa0e5fbf41c27138ac7d915922ae1))
* support addBulk in rarity queue ([39640db](https://github.com/reservoirprotocol/indexer/commit/39640db2638f6d7f358eed34af6275af19bb8719))
* update health check ([25cb183](https://github.com/reservoirprotocol/indexer/commit/25cb183036080ff1bc63156e006e0a7f3c244d80))



## [5.97.1](https://github.com/reservoirprotocol/indexer/compare/v5.97.0...v5.97.1) (2022-07-01)


### Bug Fixes

* properly associate seaport sales to transfers ([178af17](https://github.com/reservoirprotocol/indexer/commit/178af17fbc573830143582c0b30c12f7fff1e2ba))



# [5.97.0](https://github.com/reservoirprotocol/indexer/compare/v5.96.4...v5.97.0) (2022-06-30)


### Features

* added script to sync sequences ([e7c7e66](https://github.com/reservoirprotocol/indexer/commit/e7c7e66ae20bd02ac7c49407efa7e1c0bf8b2f9f))
* move calls to READER ([9c67ff1](https://github.com/reservoirprotocol/indexer/commit/9c67ff1d0f993b946b469e291108f8ad1ce43456))
* move calls to READER ([22ba806](https://github.com/reservoirprotocol/indexer/commit/22ba8061005d9d5a0a8e23dabf49cedca2e38130))
* move calls to READER ([75c7f4b](https://github.com/reservoirprotocol/indexer/commit/75c7f4bf935d219b745febc628472b3047488082))
* update migration to run only once ([7311611](https://github.com/reservoirprotocol/indexer/commit/73116115a45678ebc01b22e048a55c3d90466248))



## [5.96.4](https://github.com/reservoirprotocol/indexer/compare/v5.96.3...v5.96.4) (2022-06-30)


### Bug Fixes

* zeroex-v4/opendao token range orders ([72d3ae6](https://github.com/reservoirprotocol/indexer/commit/72d3ae6af41a459407615986216a70d6772db9bc))



## [5.96.3](https://github.com/reservoirprotocol/indexer/compare/v5.96.2...v5.96.3) (2022-06-30)


### Bug Fixes

* lowercase contract address when indexing metadata ([a321960](https://github.com/reservoirprotocol/indexer/commit/a3219604aa115dd0711143ff913c7a09249f3ba3))



## [5.96.2](https://github.com/reservoirprotocol/indexer/compare/v5.96.1...v5.96.2) (2022-06-30)


### Bug Fixes

* debug ([013b9ce](https://github.com/reservoirprotocol/indexer/commit/013b9ce6551c8a5fcfc313b4112ab51063db984f))



## [5.96.1](https://github.com/reservoirprotocol/indexer/compare/v5.96.0...v5.96.1) (2022-06-30)


### Bug Fixes

* debug ([d7a911f](https://github.com/reservoirprotocol/indexer/commit/d7a911f710dd5e6ea1224c4845c98ef5f19d3fc7))



# [5.96.0](https://github.com/reservoirprotocol/indexer/compare/v5.95.2...v5.96.0) (2022-06-30)


### Features

* get token metadata on backfilling as well ([0085de9](https://github.com/reservoirprotocol/indexer/commit/0085de9d4c8c78160304cf8e65184a8de5feacb1))



## [5.95.2](https://github.com/reservoirprotocol/indexer/compare/v5.95.1...v5.95.2) (2022-06-30)


### Bug Fixes

* stricter validation rules for execute apis query parameters ([fcd856f](https://github.com/reservoirprotocol/indexer/commit/fcd856f3afd1de3ae740f32e9459e2f8c80e143a))



## [5.95.1](https://github.com/reservoirprotocol/indexer/compare/v5.95.0...v5.95.1) (2022-06-30)


### Bug Fixes

* use default values for startTime and endTime of seaport orders ([3706706](https://github.com/reservoirprotocol/indexer/commit/3706706ef5720bfb9e56881d6892a987ad1895f4))



# [5.95.0](https://github.com/reservoirprotocol/indexer/compare/v5.94.1...v5.95.0) (2022-06-29)


### Bug Fixes

* pass collections with no attributes ([da9ffcb](https://github.com/reservoirprotocol/indexer/commit/da9ffcb82832b22d7cbb16e8b518805eb41c1134))


### Features

* store rarity rank ([449b5f7](https://github.com/reservoirprotocol/indexer/commit/449b5f750757d563d766bf211ef1000a18409227))



## [5.94.1](https://github.com/reservoirprotocol/indexer/compare/v5.94.0...v5.94.1) (2022-06-29)


### Bug Fixes

* flightcontrol build ([86b5016](https://github.com/reservoirprotocol/indexer/commit/86b5016836a5ebaeea0248acd4409a2d3a718e72))



# [5.94.0](https://github.com/reservoirprotocol/indexer/compare/v5.93.6...v5.94.0) (2022-06-29)


### Features

* added rarity column ([327628e](https://github.com/reservoirprotocol/indexer/commit/327628efefe4cb55b9dbbdb6bcb40c0cf0be40b1))
* added rarity column ([76054ef](https://github.com/reservoirprotocol/indexer/commit/76054ef260023466807f93ddc74103ddf54d23ad))
* added script to backfill collections rarity ([5f20ded](https://github.com/reservoirprotocol/indexer/commit/5f20ded17b20353467feab125055d77be923a0e8))
* remove on completed rarity ([6a39cc8](https://github.com/reservoirprotocol/indexer/commit/6a39cc8b1b8941b9b68900133b03f5623d64cc23))
* support fetching tokens by rarity ([6022f2c](https://github.com/reservoirprotocol/indexer/commit/6022f2c5e94bdb63c0cbdbe2fc36893568b7a72d))
* update migration file ([b1a4ab5](https://github.com/reservoirprotocol/indexer/commit/b1a4ab5a18441d581481d4ae7af9a49de814b3ba))
* update rarity upon minting/refresh ([36df808](https://github.com/reservoirprotocol/indexer/commit/36df808096e82d975f3523eefeb46d2c488b0c1f))
* update tokens migration ([87f3481](https://github.com/reservoirprotocol/indexer/commit/87f34814219269d78c171fbb8b223ba56fac726d))
* use read replica ([367e528](https://github.com/reservoirprotocol/indexer/commit/367e5280fb57e8d7f34f1615b026df3f578286ce))



## [5.93.6](https://github.com/reservoirprotocol/indexer/compare/v5.93.5...v5.93.6) (2022-06-29)


### Bug Fixes

* do not exit on unhandled rejections ([e403ab7](https://github.com/reservoirprotocol/indexer/commit/e403ab76949036501d35c38f2aef7ffa4d018d26))



## [5.93.5](https://github.com/reservoirprotocol/indexer/compare/v5.93.4...v5.93.5) (2022-06-29)


### Bug Fixes

* remove crashes ([e53a377](https://github.com/reservoirprotocol/indexer/commit/e53a37763279fef43b11ac5d3ca17e8070ab310b))



## [5.93.4](https://github.com/reservoirprotocol/indexer/compare/v5.93.3...v5.93.4) (2022-06-29)


### Bug Fixes

* redeploy ([eb5a818](https://github.com/reservoirprotocol/indexer/commit/eb5a818b2bc7bb24f9449630b9ce6c872ac2fb05))



## [5.93.3](https://github.com/reservoirprotocol/indexer/compare/v5.93.2...v5.93.3) (2022-06-29)


### Bug Fixes

* better x2y2 transfer issue logic ([e29cfbe](https://github.com/reservoirprotocol/indexer/commit/e29cfbedab6b72e33a59418371cfe3bf17cedaac))



## [5.93.2](https://github.com/reservoirprotocol/indexer/compare/v5.93.1...v5.93.2) (2022-06-29)


### Bug Fixes

* handle another piece of custom x2y2 cancellation logic ([5d52dba](https://github.com/reservoirprotocol/indexer/commit/5d52dba297602b7b30c837038258c15d70f89d00))



## [5.93.1](https://github.com/reservoirprotocol/indexer/compare/v5.93.0...v5.93.1) (2022-06-28)


### Bug Fixes

* properly associating collections to token sets ([27c0d48](https://github.com/reservoirprotocol/indexer/commit/27c0d48e32da20de995af83b8ff439098edc26e6))



# [5.93.0](https://github.com/reservoirprotocol/indexer/compare/v5.92.2...v5.93.0) (2022-06-28)


### Features

* prepare for optimism deployment ([cc0f691](https://github.com/reservoirprotocol/indexer/commit/cc0f691e054c13211320449497ae30cbfe28341e))
* switch collection metadata indexing to newer api ([123f5b9](https://github.com/reservoirprotocol/indexer/commit/123f5b92a41c13607b57060251a3ab9d1ecfdc93))



## [5.92.2](https://github.com/reservoirprotocol/indexer/compare/v5.92.1...v5.92.2) (2022-06-28)


### Bug Fixes

* collection owner distribution response validation errors ([d54b3ff](https://github.com/reservoirprotocol/indexer/commit/d54b3ff7916ee070c7430a40bba7ad7420257248))



## [5.92.1](https://github.com/reservoirprotocol/indexer/compare/v5.92.0...v5.92.1) (2022-06-28)


### Bug Fixes

* last sale update ([2253528](https://github.com/reservoirprotocol/indexer/commit/2253528f3b08e1ca05cbcbea380e1e5461c9104e))



# [5.92.0](https://github.com/reservoirprotocol/indexer/compare/v5.91.1...v5.92.0) (2022-06-28)


### Bug Fixes

* invalidate cancelled x2y2 listings ([0a5e4f8](https://github.com/reservoirprotocol/indexer/commit/0a5e4f8cde6afa98b32c8ee677f750684d8e8267))


### Features

* enable x2y2 order fixing script ([7e4d775](https://github.com/reservoirprotocol/indexer/commit/7e4d77541e5eda5ebccff598f91b684a81cc195f))



## [5.91.1](https://github.com/reservoirprotocol/indexer/compare/v5.91.0...v5.91.1) (2022-06-27)


### Bug Fixes

* opensea seaport rinkeby order posting ([2121162](https://github.com/reservoirprotocol/indexer/commit/2121162b7e2f9eaa78e0b642b76422bb80553a36))



# [5.91.0](https://github.com/reservoirprotocol/indexer/compare/v5.90.1...v5.91.0) (2022-06-27)


### Features

* understand more complex seaport fills ([73e40a3](https://github.com/reservoirprotocol/indexer/commit/73e40a3c9205dd36ce8118816cd939bda67fe068))



## [5.90.1](https://github.com/reservoirprotocol/indexer/compare/v5.90.0...v5.90.1) (2022-06-27)


### Bug Fixes

* support opensea seaport orders in the execute apis ([d394f99](https://github.com/reservoirprotocol/indexer/commit/d394f9913a79bc520e158625cddb712a2c365014))



# [5.90.0](https://github.com/reservoirprotocol/indexer/compare/v5.89.0...v5.90.0) (2022-06-25)


### Features

* support passing multiple contract to collections/v4 ([ac59d65](https://github.com/reservoirprotocol/indexer/commit/ac59d65e57a0965ffbd6ff58b0ad26ef2cdfe75d))



# [5.89.0](https://github.com/reservoirprotocol/indexer/compare/v5.88.0...v5.89.0) (2022-06-25)


### Features

* new api to get common collections for owners ([4222b17](https://github.com/reservoirprotocol/indexer/commit/4222b174bf7e817b85f327f9679ff50fe5d4ea19))



# [5.88.0](https://github.com/reservoirprotocol/indexer/compare/v5.87.2...v5.88.0) (2022-06-25)


### Features

* new api to get cross collections owners ([0f614d0](https://github.com/reservoirprotocol/indexer/commit/0f614d0f0a5e4cf3e7f01f7180f09157b445e0c1))



## [5.87.2](https://github.com/reservoirprotocol/indexer/compare/v5.87.1...v5.87.2) (2022-06-25)


### Bug Fixes

* wrong source detection ([2b1ec8d](https://github.com/reservoirprotocol/indexer/commit/2b1ec8d66d8063a1e391926c2d94869cbd3a2b71))



## [5.87.1](https://github.com/reservoirprotocol/indexer/compare/v5.87.0...v5.87.1) (2022-06-25)


### Bug Fixes

* forgotten warriors order source detection ([20750f1](https://github.com/reservoirprotocol/indexer/commit/20750f1e7164da97dfe6979398fc6eb70825b54c))



# [5.87.0](https://github.com/reservoirprotocol/indexer/compare/v5.86.0...v5.87.0) (2022-06-25)


### Features

* add support for posting seaport orders to opensea ([63514f5](https://github.com/reservoirprotocol/indexer/commit/63514f58c3f96ee8414b06d469f57bda1becc007))



# [5.86.0](https://github.com/reservoirprotocol/indexer/compare/v5.85.2...v5.86.0) (2022-06-24)


### Bug Fixes

* add description ([187ba8b](https://github.com/reservoirprotocol/indexer/commit/187ba8b808e7ea0d20bf30f0c18cf6485e4a48d8))
* update concurrency for mint queue ([9f8a7c1](https://github.com/reservoirprotocol/indexer/commit/9f8a7c16fc2ad4c0a8faefee0558b186540c8975))


### Features

* **collections:** dont return null sample images ([5c0d7a5](https://github.com/reservoirprotocol/indexer/commit/5c0d7a575555303f08b6e2d0b2923c9895ae7b46))



## [5.85.2](https://github.com/reservoirprotocol/indexer/compare/v5.85.1...v5.85.2) (2022-06-23)


### Bug Fixes

* filter empty keys from details api ([15b7031](https://github.com/reservoirprotocol/indexer/commit/15b7031d95370a196fc4b7ebfa31fd7d23e46932))



## [5.85.1](https://github.com/reservoirprotocol/indexer/compare/v5.85.0...v5.85.1) (2022-06-23)


### Bug Fixes

* make expirationTime in execute/list/v2 required ([ca5c2b4](https://github.com/reservoirprotocol/indexer/commit/ca5c2b4bee9f489753d40a3ebf72d7885c3fd52c))



# [5.85.0](https://github.com/reservoirprotocol/indexer/compare/v5.84.0...v5.85.0) (2022-06-23)


### Bug Fixes

* default to including flagged tokens for now ([7633d31](https://github.com/reservoirprotocol/indexer/commit/7633d31dda56d38b8eb05231cf03a6c039516df5))
* minor tweaks ([226dbc7](https://github.com/reservoirprotocol/indexer/commit/226dbc7919331b2aacd647528398298e44307405))
* order posting payload build ([919e6ad](https://github.com/reservoirprotocol/indexer/commit/919e6adb924f8447d061f0ce92347416d1de5c07))
* return correct collection top bid ([431fe4b](https://github.com/reservoirprotocol/indexer/commit/431fe4baa3aefb4eb0cae562cef84a1d95c24eef))


### Features

* add support for token-list collection bids (for non-flagged tokens bids) ([f2fe738](https://github.com/reservoirprotocol/indexer/commit/f2fe738ba251d574f0d235b4b3db2d6fdafc78ec))



# [5.84.0](https://github.com/reservoirprotocol/indexer/compare/v5.83.0...v5.84.0) (2022-06-22)


### Features

* new api to get swagger json ([14c8790](https://github.com/reservoirprotocol/indexer/commit/14c87901da767a457a93015e9b383865c2221b1e))
* new api to get swagger json ([d50392e](https://github.com/reservoirprotocol/indexer/commit/d50392e97446978530fcce7d430bf96cdef5860d))



# [5.83.0](https://github.com/reservoirprotocol/indexer/compare/v5.82.11...v5.83.0) (2022-06-22)


### Bug Fixes

* seaport end time validation ([fe7fdcd](https://github.com/reservoirprotocol/indexer/commit/fe7fdcd2bd4f1e27de233dfe0a3f871ae6264f1b))


### Features

* use v2 for buy simulation ([d4b2c99](https://github.com/reservoirprotocol/indexer/commit/d4b2c9994c99baebe538d0d0bcda781f8457aff4))



## [5.82.11](https://github.com/reservoirprotocol/indexer/compare/v5.82.10...v5.82.11) (2022-06-22)


### Bug Fixes

* fix activities api ([4b3af0e](https://github.com/reservoirprotocol/indexer/commit/4b3af0e295dfc2a1a9bd0a351859e65e46b01f09))



## [5.82.10](https://github.com/reservoirprotocol/indexer/compare/v5.82.9...v5.82.10) (2022-06-22)


### Bug Fixes

* create release from github action ([701bdce](https://github.com/reservoirprotocol/indexer/commit/701bdce17dc73b12faf7bd2ef8d08cb1d036bf50))



## [5.82.9](https://github.com/reservoirprotocol/indexer/compare/v5.82.8...v5.82.9) (2022-06-22)


### Bug Fixes

* create release from github action ([9302235](https://github.com/reservoirprotocol/indexer/commit/9302235a33c4203d2e3c728683ad57b1a32e213c))



## [5.82.8](https://github.com/reservoirprotocol/indexer/compare/v5.82.7...v5.82.8) (2022-06-22)


### Bug Fixes

* create release from github action ([67d8d09](https://github.com/reservoirprotocol/indexer/commit/67d8d091d8ff4e489ffc3fa68566c2aaf17994cf))



## [5.82.7](https://github.com/reservoirprotocol/indexer/compare/v5.82.6...v5.82.7) (2022-06-22)


### Bug Fixes

* revert release creation that was crashing ([#990](https://github.com/reservoirprotocol/indexer/issues/990)) ([5cd8347](https://github.com/reservoirprotocol/indexer/commit/5cd8347e21dd590916148f0d6a135dca142bc62a))



## [5.82.6](https://github.com/reservoirprotocol/indexer/compare/v5.82.5...v5.82.6) (2022-06-22)


### Bug Fixes

* still return sale results if collection is unknown ([b844c17](https://github.com/reservoirprotocol/indexer/commit/b844c172c41a6ca63aa522f131646c4a89c702f7))



## [5.82.5](https://github.com/reservoirprotocol/indexer/compare/v5.82.4...v5.82.5) (2022-06-22)


### Bug Fixes

* create release from github action ([60530f2](https://github.com/reservoirprotocol/indexer/commit/60530f2abeea2856b94afd17b4d8f4859aff4248))



## [5.82.4](https://github.com/reservoirprotocol/indexer/compare/v5.82.3...v5.82.4) (2022-06-22)


### Bug Fixes

* preserve all changes on changelog ([98b87d9](https://github.com/reservoirprotocol/indexer/commit/98b87d93ac855beb56f2cbe5fca8015d1b553985))
* regenerate the CHANGELOG.md ([f1be7ef](https://github.com/reservoirprotocol/indexer/commit/f1be7ef54e99674f1024fb42215bbf7960e7aac6))
* regenerate the CHANGELOG.md ([cd47de7](https://github.com/reservoirprotocol/indexer/commit/cd47de76598c70ee2ed87c13fe9f96b79690e21a))
* testing the changelog ([ca0caca](https://github.com/reservoirprotocol/indexer/commit/ca0cacaba2f06a999a8f76e130d7c4fbdc56d2c7))



## [5.82.3](https://github.com/reservoirprotocol/indexer/compare/v5.82.2...v5.82.3) (2022-06-22)


### Bug Fixes

* regenerate the CHANGELOG.md ([651e17d](https://github.com/reservoirprotocol/indexer/commit/651e17d5860db6060633130cc78ac1bbec181822))



## [5.82.2](https://github.com/reservoirprotocol/indexer/compare/v5.82.1...v5.82.2) (2022-06-22)


### Bug Fixes

* regenerate the CHANGELOG.md ([cadc8a8](https://github.com/reservoirprotocol/indexer/commit/cadc8a8b619e35dd4fe5301ac49f166082da63ae))



## [5.82.1](https://github.com/reservoirprotocol/indexer/compare/v5.82.0...v5.82.1) (2022-06-22)


### Bug Fixes

* don't update package-lock ([9238a86](https://github.com/reservoirprotocol/indexer/commit/9238a863e4f621eb8ff292424d2e7e91dd388f5f))
* remove the package-lock ([23dc19f](https://github.com/reservoirprotocol/indexer/commit/23dc19f967ba276bc1cca0a57b7645a5317ea9ff))
* update main.yaml file ([b775e1a](https://github.com/reservoirprotocol/indexer/commit/b775e1a229cf1e7765b71cf8ab62b33d840e4454))



# [5.82.0](https://github.com/reservoirprotocol/indexer/compare/v5.81.119...v5.82.0) (2022-06-22)


### Bug Fixes

* update main.yml ([ae999ca](https://github.com/reservoirprotocol/indexer/commit/ae999ca1edf5b17d524ba401af16f23534a8da15))


### Features

* test the changelog ([58a4609](https://github.com/reservoirprotocol/indexer/commit/58a4609ea78530d2b31d64dd0afaa19a9eb57aa5))



## [5.81.119](https://github.com/reservoirprotocol/indexer/compare/v5.81.118...v5.81.119) (2022-06-21)


### Features

* update timeout response ([29df03c](https://github.com/reservoirprotocol/indexer/commit/29df03c922bb97eaf140d61388a4e41b799b82f5))



## [5.81.118](https://github.com/reservoirprotocol/indexer/compare/v5.81.117...v5.81.118) (2022-06-21)



## [5.81.117](https://github.com/reservoirprotocol/indexer/compare/v5.81.116...v5.81.117) (2022-06-21)


### Features

* update timeout response ([5a36907](https://github.com/reservoirprotocol/indexer/commit/5a36907a742d1d13e8bd06af816df3afb480f8a2))



## [5.81.116](https://github.com/reservoirprotocol/indexer/compare/v5.81.115...v5.81.116) (2022-06-21)



## [5.81.115](https://github.com/reservoirprotocol/indexer/compare/v5.81.114...v5.81.115) (2022-06-21)


### Features

* changed logic to use floor price from nft balance ([83472ab](https://github.com/reservoirprotocol/indexer/commit/83472abb4d7f3ddd46bb798fee0cf841db441aa3))



## [5.81.114](https://github.com/reservoirprotocol/indexer/compare/v5.81.113...v5.81.114) (2022-06-20)


### Features

* update standard-version-action ([6c0805b](https://github.com/reservoirprotocol/indexer/commit/6c0805b73a38d40c3cdcd714c09d54a816a7a3cd))



## [5.81.113](https://github.com/reservoirprotocol/indexer/compare/v5.81.112...v5.81.113) (2022-06-20)


### Features

* update standard-version-action ([34005a8](https://github.com/reservoirprotocol/indexer/commit/34005a85f5a6cac2d6f9ca64979c53cb29122f0e))



## [5.81.112](https://github.com/reservoirprotocol/indexer/compare/v5.81.111...v5.81.112) (2022-06-20)


### Features

* update standard-version-action ([ea06b23](https://github.com/reservoirprotocol/indexer/commit/ea06b23d36362de8f4a7df01807714e814c9ea31))



## [5.81.111](https://github.com/reservoirprotocol/indexer/compare/v5.81.110...v5.81.111) (2022-06-20)


### Features

* fix github action ([1a9ccf1](https://github.com/reservoirprotocol/indexer/commit/1a9ccf1a69e4c0e76dab1f1c95edc31f43be6e89))



## [5.81.110](https://github.com/reservoirprotocol/indexer/compare/v5.81.109...v5.81.110) (2022-06-19)


### Bug Fixes

* always trigger job when seaport fill event is detected ([c58fad6](https://github.com/reservoirprotocol/indexer/commit/c58fad6cf067711eec9e63be61418daa50df0290))
* debug ([1b83a08](https://github.com/reservoirprotocol/indexer/commit/1b83a0887f593661e7337635589257a959148f9b))
* filling attribute orders ([e6f4fbc](https://github.com/reservoirprotocol/indexer/commit/e6f4fbc6fc3e17b47baa2dce7912d0ad5dc6b760))
* join signature when using seaport ([05184cc](https://github.com/reservoirprotocol/indexer/commit/05184ccdeab6a8feab9f066e6b854b77da8f10e7))
* missing price on seaport bids ([81a6c89](https://github.com/reservoirprotocol/indexer/commit/81a6c89828f9253a6f3a0198b39f4216a05cd464))
* oracle usd query ([78d3db8](https://github.com/reservoirprotocol/indexer/commit/78d3db83ba1cf82d4470d6246820926ddc9b39e0))
* remove debug logs ([71a8c49](https://github.com/reservoirprotocol/indexer/commit/71a8c49d2aa5cc6594e973422a6c01253ed54c0d))


### Features

* add suport for seaport contract-wide and token-list bids ([ab481b1](https://github.com/reservoirprotocol/indexer/commit/ab481b1117fcd06a23f61d6f5fb0cad4cde2d78a))
* support executing seaport bids ([99efceb](https://github.com/reservoirprotocol/indexer/commit/99efceb333b475734e060f2e40b49afd30229679))



## [5.81.109](https://github.com/reservoirprotocol/indexer/compare/v5.81.108...v5.81.109) (2022-06-18)


### Bug Fixes

* debug missing last sale ([b26763b](https://github.com/reservoirprotocol/indexer/commit/b26763b30aa6b287c9f4b9d834f7241efe5642ff))



## [5.81.108](https://github.com/reservoirprotocol/indexer/compare/v5.81.107...v5.81.108) (2022-06-18)


### Bug Fixes

* only update last sale if a more recent is available ([1fcb340](https://github.com/reservoirprotocol/indexer/commit/1fcb340c2420f2b5f464a76fdbdd610809d5d365))



## [5.81.107](https://github.com/reservoirprotocol/indexer/compare/v5.81.106...v5.81.107) (2022-06-18)


### Bug Fixes

* various fixes ([cf85109](https://github.com/reservoirprotocol/indexer/commit/cf85109077ebcbe8d1ff456f9886d738dfc55446))



## [5.81.106](https://github.com/reservoirprotocol/indexer/compare/v5.81.105...v5.81.106) (2022-06-17)


### Features

* return lastSells from explore/v2 api ([f7e9d9c](https://github.com/reservoirprotocol/indexer/commit/f7e9d9ca20a2087adb094f2dc3c389cbe95cf21c))



## [5.81.105](https://github.com/reservoirprotocol/indexer/compare/v5.81.104...v5.81.105) (2022-06-17)


### Features

* return lastSells from explore/v2 api ([27e8ddb](https://github.com/reservoirprotocol/indexer/commit/27e8ddbbcd6c804f0e0b64ca7cfd3e4ec2ae2729))



## [5.81.104](https://github.com/reservoirprotocol/indexer/compare/v5.81.103...v5.81.104) (2022-06-17)


### Features

* update concurrency for orders queue ([19304b8](https://github.com/reservoirprotocol/indexer/commit/19304b865dab78b26da2e809bfdc5df8797cffd2))



## [5.81.103](https://github.com/reservoirprotocol/indexer/compare/v5.81.102...v5.81.103) (2022-06-17)


### Features

* no need for another job for token bids ([4dec3f2](https://github.com/reservoirprotocol/indexer/commit/4dec3f22582c57adec9823fbb72d2a8bdaa6070c))



## [5.81.102](https://github.com/reservoirprotocol/indexer/compare/v5.81.101...v5.81.102) (2022-06-17)


### Features

* reduce dynamic queue limit ([dc7a8b0](https://github.com/reservoirprotocol/indexer/commit/dc7a8b07b5dcc5b96dddfac829e71dc6b84d62e1))
* update token bids in batches ([a4be359](https://github.com/reservoirprotocol/indexer/commit/a4be359572798f3cbf1cda95156cdef110681f92))
* update token bids in batches in single queue ([efe8e3a](https://github.com/reservoirprotocol/indexer/commit/efe8e3a001cc52f1c242b47bc585efd484522334))
* update token bids in batches in single queue ([ad89c7a](https://github.com/reservoirprotocol/indexer/commit/ad89c7af6dd2166ca6a8c4f946cc58e2389d5f5a))



## [5.81.101](https://github.com/reservoirprotocol/indexer/compare/v5.81.100...v5.81.101) (2022-06-17)


### Features

* added backfill job ([30253fb](https://github.com/reservoirprotocol/indexer/commit/30253fb116193f8a3fd94345c1fe9d1364f11961))
* added error handling ([c214d2f](https://github.com/reservoirprotocol/indexer/commit/c214d2fda1709b5d40bc193ef955e50426ba8d6f))
* added order source logic ([d0fd0e7](https://github.com/reservoirprotocol/indexer/commit/d0fd0e7418615a89c02fe7d3180b976c087e0a85))
* disabled on backfill, updated logs ([21254d3](https://github.com/reservoirprotocol/indexer/commit/21254d34b368e9f1fb476a5c6b350a5141d84138))
* enabled backfill ([fcb11aa](https://github.com/reservoirprotocol/indexer/commit/fcb11aa97d42166dbef7847c5f43bc33681f0e40))
* femoved log, switched to read replica ([35691df](https://github.com/reservoirprotocol/indexer/commit/35691dfb6d3acdfa0b5dfef55d6bd571dadc091b))
* fix order source logic ([2e6bf9d](https://github.com/reservoirprotocol/indexer/commit/2e6bf9d2b6abfa3d684a1aa95832b638cb5da7da))
* fixed log ([7e3711a](https://github.com/reservoirprotocol/indexer/commit/7e3711a41c35c59733cab5dc8411f742fe0ccbb2))



## [5.81.100](https://github.com/reservoirprotocol/indexer/compare/v5.81.99...v5.81.100) (2022-06-17)


### Features

* allow to pass single string to types in activities api ([c78b564](https://github.com/reservoirprotocol/indexer/commit/c78b564638c5d621ae817eb672e3f9f81ae511bf))



## [5.81.99](https://github.com/reservoirprotocol/indexer/compare/v5.81.98...v5.81.99) (2022-06-17)



## [5.81.98](https://github.com/reservoirprotocol/indexer/compare/v5.81.97...v5.81.98) (2022-06-17)


### Bug Fixes

* query ([4e59d6d](https://github.com/reservoirprotocol/indexer/commit/4e59d6d9ab134e1795c494131ac3b831acedd794))



## [5.81.97](https://github.com/reservoirprotocol/indexer/compare/v5.81.96...v5.81.97) (2022-06-17)


### Bug Fixes

* off-chain cancel previous x2y2 orders when lowering price ([889fa4b](https://github.com/reservoirprotocol/indexer/commit/889fa4bd1016bc10474d8aa7a7603a95506428a7))



## [5.81.96](https://github.com/reservoirprotocol/indexer/compare/v5.81.95...v5.81.96) (2022-06-16)


### Features

* updated backfill limit ([c2eca2a](https://github.com/reservoirprotocol/indexer/commit/c2eca2a5cb0e0de6b13870d6ea4188e3aa2650c7))



## [5.81.95](https://github.com/reservoirprotocol/indexer/compare/v5.81.94...v5.81.95) (2022-06-16)


### Bug Fixes

* create missing index for token_attributes ([2c872c3](https://github.com/reservoirprotocol/indexer/commit/2c872c309119534eab3fc8a75707ce9379e0578b))



## [5.81.94](https://github.com/reservoirprotocol/indexer/compare/v5.81.93...v5.81.94) (2022-06-16)


### Features

* move some models to read from replica ([9954293](https://github.com/reservoirprotocol/indexer/commit/99542937558034e5bca4f9154d3cd52be27c88f1))



## [5.81.93](https://github.com/reservoirprotocol/indexer/compare/v5.81.92...v5.81.93) (2022-06-16)


### Features

* move some models to read from replica ([5205df2](https://github.com/reservoirprotocol/indexer/commit/5205df2ef8b44bf592629efa2fd3c542b6eeec70))



## [5.81.92](https://github.com/reservoirprotocol/indexer/compare/v5.81.91...v5.81.92) (2022-06-16)


### Bug Fixes

* store latest price for seaport orders ([870c273](https://github.com/reservoirprotocol/indexer/commit/870c273e3de836b996049d8ec13a2ee92dfb1edb))


### Features

* handle seaport dutch auctions ([ba381ec](https://github.com/reservoirprotocol/indexer/commit/ba381ec890c9a981f66b51251bd45519f32019f4))



## [5.81.91](https://github.com/reservoirprotocol/indexer/compare/v5.81.90...v5.81.91) (2022-06-16)


### Features

* move some models to read from replica ([ee52e80](https://github.com/reservoirprotocol/indexer/commit/ee52e80388c7821d14156c9b20929ef95e1b2e80))



## [5.81.90](https://github.com/reservoirprotocol/indexer/compare/v5.81.89...v5.81.90) (2022-06-16)


### Features

* use default sourced everywhere ([ba916f1](https://github.com/reservoirprotocol/indexer/commit/ba916f10910aed82a468f53e85c38c29295e6b8d))



## [5.81.89](https://github.com/reservoirprotocol/indexer/compare/v5.81.88...v5.81.89) (2022-06-16)


### Bug Fixes

* properly handle x2y2 approvals ([f73946e](https://github.com/reservoirprotocol/indexer/commit/f73946e63f9f5116feacd027ee899e6d83686dbc))



## [5.81.88](https://github.com/reservoirprotocol/indexer/compare/v5.81.87...v5.81.88) (2022-06-16)



## [5.81.87](https://github.com/reservoirprotocol/indexer/compare/v5.81.86...v5.81.87) (2022-06-15)


### Bug Fixes

* default seaport fills to opensea ([2c767e8](https://github.com/reservoirprotocol/indexer/commit/2c767e8e3c027dd82c4945ddbdb203b1300db848))



## [5.81.86](https://github.com/reservoirprotocol/indexer/compare/v5.81.85...v5.81.86) (2022-06-15)



## [5.81.85](https://github.com/reservoirprotocol/indexer/compare/v5.81.84...v5.81.85) (2022-06-15)


### Bug Fixes

* proper topic for counter incremented event ([f901dcd](https://github.com/reservoirprotocol/indexer/commit/f901dcd0d66b8268add21b950f766d3a02985d00))
* typo ([98e8b78](https://github.com/reservoirprotocol/indexer/commit/98e8b78382f49ea839b1a1446144e067ff7abe0a))
* use generic address ([bcc5a6d](https://github.com/reservoirprotocol/indexer/commit/bcc5a6da73ca9179d92d2a18ae3d29b992e9c61e))


### Features

* add support for cancelling seaport orders ([81eca46](https://github.com/reservoirprotocol/indexer/commit/81eca46cca25de7fccc3fcd8294054a579dd99bb))
* add support for seaport listings ([e3db43d](https://github.com/reservoirprotocol/indexer/commit/e3db43dc417582370ce170973f6a004735c5aaa7))



## [5.81.84](https://github.com/reservoirprotocol/indexer/compare/v5.81.83...v5.81.84) (2022-06-15)


### Bug Fixes

* debug ([79065fd](https://github.com/reservoirprotocol/indexer/commit/79065fdc506776f37ad9937458beb487a4d72b68))
* debug ([2f3f933](https://github.com/reservoirprotocol/indexer/commit/2f3f9331e67814879b07d54d23ba10f6c2bd3eb4))
* debug price feed publish ([3e44d3c](https://github.com/reservoirprotocol/indexer/commit/3e44d3c602de7c60e8f41f73aed5abf449001f75))
* debugging ([ea19b18](https://github.com/reservoirprotocol/indexer/commit/ea19b184d11e70dda84f048f512aa05c91e29681))
* oracle query ([4c1954c](https://github.com/reservoirprotocol/indexer/commit/4c1954c0146719be0e05bf1ab5be9c5bb4310fe6))


### Features

* add cron job to post prices to data feeds ([dbc2949](https://github.com/reservoirprotocol/indexer/commit/dbc2949852a335fd33831c628631e61fff76d019))



## [5.81.83](https://github.com/reservoirprotocol/indexer/compare/v5.81.82...v5.81.83) (2022-06-15)


### Bug Fixes

* seaport fee breakdown ([7bba9f1](https://github.com/reservoirprotocol/indexer/commit/7bba9f1da811c39c42b7d83dd54cad3feaebb3d4))



## [5.81.82](https://github.com/reservoirprotocol/indexer/compare/v5.81.81...v5.81.82) (2022-06-15)



## [5.81.81](https://github.com/reservoirprotocol/indexer/compare/v5.81.80...v5.81.81) (2022-06-15)


### Bug Fixes

* allow bps to be null ([27bb75f](https://github.com/reservoirprotocol/indexer/commit/27bb75fab114138ac3e4298928b09e89c9c40aad))



## [5.81.80](https://github.com/reservoirprotocol/indexer/compare/v5.81.79...v5.81.80) (2022-06-14)


### Features

* support filling seaport orders ([09b5327](https://github.com/reservoirprotocol/indexer/commit/09b5327eb084b9bda4a684f30099063d6e9850ac))



## [5.81.79](https://github.com/reservoirprotocol/indexer/compare/v5.81.78...v5.81.79) (2022-06-14)


### Bug Fixes

* price handling ([5c5ca9e](https://github.com/reservoirprotocol/indexer/commit/5c5ca9ee9f95983208ca3aa128f89af5f5fbecaa))



## [5.81.78](https://github.com/reservoirprotocol/indexer/compare/v5.81.77...v5.81.78) (2022-06-14)


### Bug Fixes

* zone address fix ([d9f9156](https://github.com/reservoirprotocol/indexer/commit/d9f915635ce86667c5774bdf42b3c068a5de2d0a))



## [5.81.77](https://github.com/reservoirprotocol/indexer/compare/v5.81.76...v5.81.77) (2022-06-14)


### Features

* more zones ([81225a8](https://github.com/reservoirprotocol/indexer/commit/81225a88ec7c5ceeeccab4a9d7a9139e1f33b24e))



## [5.81.76](https://github.com/reservoirprotocol/indexer/compare/v5.81.75...v5.81.76) (2022-06-14)


### Bug Fixes

* fix query ([01e9421](https://github.com/reservoirprotocol/indexer/commit/01e9421752c65b7763e16bddf217acaab20a0acd))



## [5.81.75](https://github.com/reservoirprotocol/indexer/compare/v5.81.74...v5.81.75) (2022-06-14)


### Bug Fixes

* fix query errors ([1190d58](https://github.com/reservoirprotocol/indexer/commit/1190d58b4c7b1896629e374222c0eedc998ee158))



## [5.81.74](https://github.com/reservoirprotocol/indexer/compare/v5.81.73...v5.81.74) (2022-06-14)


### Features

* switch to new router ([70c1a11](https://github.com/reservoirprotocol/indexer/commit/70c1a11c7cfe6c2c084ab3be5ad2a9c335cbd6cf))



## [5.81.73](https://github.com/reservoirprotocol/indexer/compare/v5.81.72...v5.81.73) (2022-06-14)


### Features

* understand opensea seaport orders ([2891bed](https://github.com/reservoirprotocol/indexer/commit/2891bed4f90c4050334705d0010dcf4915a6b170))



## [5.81.72](https://github.com/reservoirprotocol/indexer/compare/v5.81.71...v5.81.72) (2022-06-14)



## [5.81.71](https://github.com/reservoirprotocol/indexer/compare/v5.81.70...v5.81.71) (2022-06-14)


### Features

* pass token id when refreshing collections ([30af27c](https://github.com/reservoirprotocol/indexer/commit/30af27c72da743a28d684aad5dd2e573756507a5))



## [5.81.70](https://github.com/reservoirprotocol/indexer/compare/v5.81.69...v5.81.70) (2022-06-14)



## [5.81.69](https://github.com/reservoirprotocol/indexer/compare/v5.81.68...v5.81.69) (2022-06-14)


### Features

* removed logs, enabled backfill ([920120b](https://github.com/reservoirprotocol/indexer/commit/920120b8e5482579f8e7a0709bb1d64fc84aa5fb))



## [5.81.68](https://github.com/reservoirprotocol/indexer/compare/v5.81.67...v5.81.68) (2022-06-14)


### Features

* added logs ([f296d53](https://github.com/reservoirprotocol/indexer/commit/f296d5339c372220a6e5d36d1c34a01fb5557680))
* disabled backfill ([4ad709f](https://github.com/reservoirprotocol/indexer/commit/4ad709f7882086c3f49e70444935a1c2d27573a6))
* disabled bid order event logic ([b2cece7](https://github.com/reservoirprotocol/indexer/commit/b2cece793050a8835ea9ffcf33728a2ee081b2a0))
* enabled backfill ([8c75ffc](https://github.com/reservoirprotocol/indexer/commit/8c75ffcf5bce195a103016bbf1c58b2bdcaeb10c))
* fixed remove job ([27aaae5](https://github.com/reservoirprotocol/indexer/commit/27aaae5ef15a3e5d76c404d9447e1be70c7a4fbd))



## [5.81.67](https://github.com/reservoirprotocol/indexer/compare/v5.81.66...v5.81.67) (2022-06-14)


### Bug Fixes

* rever formatEth changes ([d2aac5d](https://github.com/reservoirprotocol/indexer/commit/d2aac5dedead00726f5988962e1ef8fe6d4d4e70))



## [5.81.66](https://github.com/reservoirprotocol/indexer/compare/v5.81.65...v5.81.66) (2022-06-14)


### Bug Fixes

* consider usdc decimals ([c636e63](https://github.com/reservoirprotocol/indexer/commit/c636e63ab9fc03152d490470e9bf6a0b032d8426))



## [5.81.65](https://github.com/reservoirprotocol/indexer/compare/v5.81.64...v5.81.65) (2022-06-14)


### Features

* oracle tweaks ([e549eae](https://github.com/reservoirprotocol/indexer/commit/e549eae5490f6eed980502c3819908260abe78dc))



## [5.81.64](https://github.com/reservoirprotocol/indexer/compare/v5.81.63...v5.81.64) (2022-06-13)


### Features

* added logic to avoid duplicate jobs ([a5aac7d](https://github.com/reservoirprotocol/indexer/commit/a5aac7d01b93623181485ddd772d81b2bb885383))



## [5.81.63](https://github.com/reservoirprotocol/indexer/compare/v5.81.62...v5.81.63) (2022-06-13)


### Bug Fixes

* skip null conduits when checking buy approval ([82bf103](https://github.com/reservoirprotocol/indexer/commit/82bf10327c648cac27ef2339520ecb1a4a3d3152))
* tweaks ([c45f57e](https://github.com/reservoirprotocol/indexer/commit/c45f57efbf60817d3b489d540100990aec09e15a))



## [5.81.62](https://github.com/reservoirprotocol/indexer/compare/v5.81.61...v5.81.62) (2022-06-13)


### Bug Fixes

* skip null conduits when checking buy approval ([56bb80e](https://github.com/reservoirprotocol/indexer/commit/56bb80ef197ada8d88684b14a384323ba50ecfe8))



## [5.81.61](https://github.com/reservoirprotocol/indexer/compare/v5.81.60...v5.81.61) (2022-06-13)


### Bug Fixes

* debugging ([e517c22](https://github.com/reservoirprotocol/indexer/commit/e517c22aec5282e6091ac6713604d3a3fc7c0a30))
* minor tweaks ([6f49f2d](https://github.com/reservoirprotocol/indexer/commit/6f49f2d0e35a59ec8499d06cf34d6d8c2a71e30b))
* minor tweaks ([d91a796](https://github.com/reservoirprotocol/indexer/commit/d91a7963769e2b48cd53634c71a21a1bb1c794d9))
* minor tweaks ([a561ac2](https://github.com/reservoirprotocol/indexer/commit/a561ac2fe2ddac50af8bc1908656c0f7bbac0234))
* remove debug logs ([64fee85](https://github.com/reservoirprotocol/indexer/commit/64fee856c744b39eedf8ea7b21de5a5256df2ac7))
* tweaks ([581da75](https://github.com/reservoirprotocol/indexer/commit/581da7538825236167033c64c1576002d187a6ad))
* tweaks for seaport events syncing ([598ccf2](https://github.com/reservoirprotocol/indexer/commit/598ccf21ce63498659a7c480a986837adbce10e1))
* typo ([6c3f246](https://github.com/reservoirprotocol/indexer/commit/6c3f246085c3446fef1943b25e416d32faaa60fb))


### Features

* finalize basic seaport integration ([78b7ff2](https://github.com/reservoirprotocol/indexer/commit/78b7ff22c2cd34e2aa2a8a7acb8ccc44d48ddf97))
* more support for seaport ([209d946](https://github.com/reservoirprotocol/indexer/commit/209d94648bdec7132d2cb3cedfad90adc38df857))
* seaport integration work in progress ([8692cf8](https://github.com/reservoirprotocol/indexer/commit/8692cf8f7473311722625b56bafb803429117c9d))
* switch to seaport v1.1 ([7f2929c](https://github.com/reservoirprotocol/indexer/commit/7f2929c315d65f41847ad39679abd32a898d8e4d))



## [5.81.60](https://github.com/reservoirprotocol/indexer/compare/v5.81.59...v5.81.60) (2022-06-13)


### Features

* updated limit ([0e5ab22](https://github.com/reservoirprotocol/indexer/commit/0e5ab22961ea2107c9cfbcd27708629181968f6c))



## [5.81.59](https://github.com/reservoirprotocol/indexer/compare/v5.81.58...v5.81.59) (2022-06-13)


### Features

* enable backfill ([8612f7d](https://github.com/reservoirprotocol/indexer/commit/8612f7d9ca75bf07b986f9461d0a5f8fadb46f75))



## [5.81.58](https://github.com/reservoirprotocol/indexer/compare/v5.81.57...v5.81.58) (2022-06-13)


### Features

* created backfill for created at ([be4df8b](https://github.com/reservoirprotocol/indexer/commit/be4df8b0594a6126116f03ce5ffc86dad47a4df9))
* disabled backfill ([23be892](https://github.com/reservoirprotocol/indexer/commit/23be892abb58b8977478f77545f305b8d61d00bc))
* enabled backfill ([88e33bc](https://github.com/reservoirprotocol/indexer/commit/88e33bce59d1dde18277801b52f91594a12d6920))



## [5.81.57](https://github.com/reservoirprotocol/indexer/compare/v5.81.56...v5.81.57) (2022-06-11)


### Bug Fixes

* tweaks ([1759de4](https://github.com/reservoirprotocol/indexer/commit/1759de4d2347f642afac4681f938d318b67a9d69))



## [5.81.56](https://github.com/reservoirprotocol/indexer/compare/v5.81.55...v5.81.56) (2022-06-11)


### Bug Fixes

* switch tokens details api to work off the main database ([fd366be](https://github.com/reservoirprotocol/indexer/commit/fd366be56bfb5f8b17b4207cb7a65307dbeb9b21))



## [5.81.55](https://github.com/reservoirprotocol/indexer/compare/v5.81.54...v5.81.55) (2022-06-11)


### Bug Fixes

* router filling misattribution ([dc98ce9](https://github.com/reservoirprotocol/indexer/commit/dc98ce94ed32d4fc14b6a5937fa4f6302aeea3ea))



## [5.81.54](https://github.com/reservoirprotocol/indexer/compare/v5.81.53...v5.81.54) (2022-06-11)


### Bug Fixes

* debug log ([27d3fcd](https://github.com/reservoirprotocol/indexer/commit/27d3fcd0dbe7addefaabba3e1a1e4d3aee6f2f87))
* use main db for tokens api ([b9bc36d](https://github.com/reservoirprotocol/indexer/commit/b9bc36d7c439ad93e163c13c01969e108a6d2156))



## [5.81.53](https://github.com/reservoirprotocol/indexer/compare/v5.81.52...v5.81.53) (2022-06-10)


### Features

* revert some calls back to main db ([f552b14](https://github.com/reservoirprotocol/indexer/commit/f552b14ee64dd3785f6127faceeebf0647f5822f))



## [5.81.52](https://github.com/reservoirprotocol/indexer/compare/v5.81.51...v5.81.52) (2022-06-10)


### Features

* revert some calls back to main db ([986e331](https://github.com/reservoirprotocol/indexer/commit/986e331dbf506d73fc61e6b1e0c34bfacb8bbe18))



## [5.81.51](https://github.com/reservoirprotocol/indexer/compare/v5.81.50...v5.81.51) (2022-06-10)


### Features

* move more logix to read from replica ([3daca8a](https://github.com/reservoirprotocol/indexer/commit/3daca8a85cfd3c5148dc318b09ee9f9af3da075f))



## [5.81.50](https://github.com/reservoirprotocol/indexer/compare/v5.81.49...v5.81.50) (2022-06-10)


### Features

* move more apis to read from replica ([c9cdd6d](https://github.com/reservoirprotocol/indexer/commit/c9cdd6d3e271146ba699789daea46d3dcbcf56d1))
* update comment ([f5694b0](https://github.com/reservoirprotocol/indexer/commit/f5694b05fb0c863e0714785ceff5e6640f101ee6))
* update github action to merge PR to main branch ([2618773](https://github.com/reservoirprotocol/indexer/commit/2618773db0f97fc6fbbae802fb3a21246f79629e))



## [5.81.49](https://github.com/reservoirprotocol/indexer/compare/v5.81.48...v5.81.49) (2022-06-10)


### Bug Fixes

* proper x2y2 order value ([e4e7187](https://github.com/reservoirprotocol/indexer/commit/e4e718783d5fb5d3ae5fb04a8d0564ecb09dabdb))


### Features

* point more APIs to replica ([98999c6](https://github.com/reservoirprotocol/indexer/commit/98999c69d12f4fced09f3b1aeec0934f26a990d1))
* point more APIs to replica ([429ec64](https://github.com/reservoirprotocol/indexer/commit/429ec64b81662f0586318a3fe131193d73ec2c18))
* point more APIs to replica ([88173e7](https://github.com/reservoirprotocol/indexer/commit/88173e76d7fcd9629d1167ecbbfc80ad0792482a))



## [5.81.48](https://github.com/reservoirprotocol/indexer/compare/v5.81.47...v5.81.48) (2022-06-10)


### Bug Fixes

* make chain id not required ([d8f14bb](https://github.com/reservoirprotocol/indexer/commit/d8f14bb66fcb388eaca1a1a47ca41aca66e83817))



## [5.81.47](https://github.com/reservoirprotocol/indexer/compare/v5.81.46...v5.81.47) (2022-06-10)


### Features

* allow specifying a different chain id to sign oracle message for ([48f38d1](https://github.com/reservoirprotocol/indexer/commit/48f38d17121957e22c7b1da340ba3b191ee0fc99))



## [5.81.46](https://github.com/reservoirprotocol/indexer/compare/v5.81.45...v5.81.46) (2022-06-09)



## [5.81.45](https://github.com/reservoirprotocol/indexer/compare/v5.81.44...v5.81.45) (2022-06-09)


### Bug Fixes

* add missing event data ([8d4a586](https://github.com/reservoirprotocol/indexer/commit/8d4a586d33c2a3c119a20a8b14174565192df2f0))
* buy approval update query ([5d8ffbc](https://github.com/reservoirprotocol/indexer/commit/5d8ffbc812972d44b25360c3524f0761040ce9f6))
* debug ([a27260a](https://github.com/reservoirprotocol/indexer/commit/a27260a89ef048efb0719d738e5634ebd0dd2cf5))
* debug ([c6e1f8f](https://github.com/reservoirprotocol/indexer/commit/c6e1f8ffdd1f20f8172fcf3aed1c541a24766660))
* debug ([6831717](https://github.com/reservoirprotocol/indexer/commit/6831717239dd24c400377e4d06e26357dd5edf7b))
* debugging ([b65bbc1](https://github.com/reservoirprotocol/indexer/commit/b65bbc1504c2bf0b6ccf255c26cfef7d81c7fa6c))
* minor tweaks ([7a559b5](https://github.com/reservoirprotocol/indexer/commit/7a559b54fda481d0c3f5a67c124d5062b7689960))
* remove debug logs ([7e4cbad](https://github.com/reservoirprotocol/indexer/commit/7e4cbad4cb5345eb555e31e0c2b2b6b6311ec670))
* update log for debugging purposes ([ef7dac7](https://github.com/reservoirprotocol/indexer/commit/ef7dac724d2f353b5ff353e8ebbc0a56602abc6d))
* update migration file timestamp ([e940d3d](https://github.com/reservoirprotocol/indexer/commit/e940d3deb6f20ffcafc8919d06a889ab7e814169))
* use proper contract address ([5971043](https://github.com/reservoirprotocol/indexer/commit/597104314d5f10f996b56b6d9bb69dc567c90278))


### Features

* add support for weth approvals ([9293f8f](https://github.com/reservoirprotocol/indexer/commit/9293f8f53de74d9b14c7d500d93fe5513413eb73))



## [5.81.44](https://github.com/reservoirprotocol/indexer/compare/v5.81.43...v5.81.44) (2022-06-09)


### Features

* improved oracle ([d8a9b0d](https://github.com/reservoirprotocol/indexer/commit/d8a9b0d7a3091b149383bd38aca72a3bacc15017))



## [5.81.43](https://github.com/reservoirprotocol/indexer/compare/v5.81.42...v5.81.43) (2022-06-08)


### Features

* added missing index ([b47b592](https://github.com/reservoirprotocol/indexer/commit/b47b5925158e96a6125fe4e6ad823b3a3582d222))
* lower case community ([b57479c](https://github.com/reservoirprotocol/indexer/commit/b57479ca7cbbd26e63c781bfde3328912eecf00a))
* move tokens api to replica ([d49a3d9](https://github.com/reservoirprotocol/indexer/commit/d49a3d929f773c7b3927d4916e46e89ed78a44bc))
* removed log ([33c9788](https://github.com/reservoirprotocol/indexer/commit/33c97886ae26e1bbf7a47f0405dd5ff492262968))
* update concurrency for order queues ([0acc167](https://github.com/reservoirprotocol/indexer/commit/0acc167b001539bbc036129593c9705f9b25cff1))
* update concurrency for order queues ([77fd819](https://github.com/reservoirprotocol/indexer/commit/77fd819b0a3b5607cd0c06b3086aa5742dd122e5))
* updated retry logic ([9ddf56f](https://github.com/reservoirprotocol/indexer/commit/9ddf56f0bc532a055f6f3c0394f39acf76bc102f))
* updated retry logic revert ([e1035dd](https://github.com/reservoirprotocol/indexer/commit/e1035dd3cd07652381c9f797742583714b645adf))
* updated retry logic v2 ([fe0785c](https://github.com/reservoirprotocol/indexer/commit/fe0785cd057d6671aa3d8603c65183ee2c9f56ed))
* updated retry logic v3 ([69bdab2](https://github.com/reservoirprotocol/indexer/commit/69bdab207f4d4d04b0d54a422191a0f7ea4a2485))
* updated retry logic v4 ([a760f21](https://github.com/reservoirprotocol/indexer/commit/a760f216af548b011f226293ae9ff0fe1fed3e28))



## [5.81.42](https://github.com/reservoirprotocol/indexer/compare/v5.81.41...v5.81.42) (2022-06-07)


### Features

* added caching on redirects APIs ([411f402](https://github.com/reservoirprotocol/indexer/commit/411f40256172e10d87c9d2f07ffb94b1992565a8))
* do migration on read replica as well ([be42937](https://github.com/reservoirprotocol/indexer/commit/be4293718545d96e11b51159f9db7706d13d9240))
* don't use replica in APIs reading from the orders table ([f19f88e](https://github.com/reservoirprotocol/indexer/commit/f19f88e7566436d846fa0248afe756b7cbdb116b))
* fix attributes migration ([de7ab63](https://github.com/reservoirprotocol/indexer/commit/de7ab6349d6e14668204ddae7f6a7054ea562755))
* fix attributes migration ([f0da498](https://github.com/reservoirprotocol/indexer/commit/f0da498a6437b6d349cb6586d0fed86f361e48f5))
* more use of read replica ([8dc8223](https://github.com/reservoirprotocol/indexer/commit/8dc82235fa6b55bc33fed82f7e606602f18da7a3))
* update attributes migrate script ([b9d7b1d](https://github.com/reservoirprotocol/indexer/commit/b9d7b1d3911c98d3e3723014e25d7413f92ac0a3))
* update migrate script ([bde3cc5](https://github.com/reservoirprotocol/indexer/commit/bde3cc54a5bd5b87567ab4b39c20e9b23999859a))
* update migrate script ([c8ac9fd](https://github.com/reservoirprotocol/indexer/commit/c8ac9fd76fb58b45311df66739b19913e0414a90))
* use read replica db for all cached apis ([3b7158f](https://github.com/reservoirprotocol/indexer/commit/3b7158fe154a34eff563b80697566221d17662ff))
* use read replica for token/collection/sources ([45065cf](https://github.com/reservoirprotocol/indexer/commit/45065cf4e8ed6ffc50ed94df7c72fd90190e47b2))
* use replica for transfers api as well ([ad0860c](https://github.com/reservoirprotocol/indexer/commit/ad0860c50cb6d17542e9f367607a20a38262c749))



## [5.81.41](https://github.com/reservoirprotocol/indexer/compare/v5.81.40...v5.81.41) (2022-06-06)


### Features

* disabled logic ([08339cd](https://github.com/reservoirprotocol/indexer/commit/08339cd50fae0b571750ae2be78f45eb0bce1e63))



## [5.81.40](https://github.com/reservoirprotocol/indexer/compare/v5.81.39...v5.81.40) (2022-06-06)


### Features

* added logic for top bid ([232f75e](https://github.com/reservoirprotocol/indexer/commit/232f75eab9c15c180f7b2c6458949d8ddf337fde))
* disable backfill ([5c82d40](https://github.com/reservoirprotocol/indexer/commit/5c82d40b72b725fbd38ab913766b1ec9a51ee6dd))
* enabled backfill ([0bdf92e](https://github.com/reservoirprotocol/indexer/commit/0bdf92ea9d92681b5e845cf2092296b4d70bb2c1))
* fix migration ([f40940b](https://github.com/reservoirprotocol/indexer/commit/f40940bd48f20cb3d68e9a135ba04d339135de6f))
* fix migration ([7a05dc3](https://github.com/reservoirprotocol/indexer/commit/7a05dc381b651dae50d889f1384e195a58f4e19b))



## [5.81.39](https://github.com/reservoirprotocol/indexer/compare/v5.81.38...v5.81.39) (2022-06-06)


### Bug Fixes

* allow forcing orphan block check job ([6d102f1](https://github.com/reservoirprotocol/indexer/commit/6d102f13fbcfb3a3a31f3aa3f841dd1a8b29a644))



## [5.81.38](https://github.com/reservoirprotocol/indexer/compare/v5.81.37...v5.81.38) (2022-06-06)


### Bug Fixes

* allow forcing block orphan check job to work off the events table ([5e26130](https://github.com/reservoirprotocol/indexer/commit/5e26130643556b1f81459dd0607f1655fb14011e))



## [5.81.37](https://github.com/reservoirprotocol/indexer/compare/v5.81.36...v5.81.37) (2022-06-06)


### Bug Fixes

* correct delays for orphan block checking ([778e201](https://github.com/reservoirprotocol/indexer/commit/778e201fee7ff91bdbcadfa5bf72d15948579817))



## [5.81.36](https://github.com/reservoirprotocol/indexer/compare/v5.81.35...v5.81.36) (2022-06-06)


### Features

* improved orphan blocks handling ([5c8f0dc](https://github.com/reservoirprotocol/indexer/commit/5c8f0dceb5f2d48f44d1b63ac3fe57d375171d9b))



## [5.81.35](https://github.com/reservoirprotocol/indexer/compare/v5.81.34...v5.81.35) (2022-06-06)


### Features

* return fill source in apis ([9f344c2](https://github.com/reservoirprotocol/indexer/commit/9f344c21c1777059d3d814b6904c52a540f4ea47))



## [5.81.34](https://github.com/reservoirprotocol/indexer/compare/v5.81.33...v5.81.34) (2022-06-06)


### Features

* keep track of the fill source for every sale ([dec4b06](https://github.com/reservoirprotocol/indexer/commit/dec4b0649c44f5fe8ee6382d17d2081b9844657c))



## [5.81.33](https://github.com/reservoirprotocol/indexer/compare/v5.81.32...v5.81.33) (2022-06-04)


### Bug Fixes

* address division by zero issue when posting zeroex-v4 bids with a price of zero ([32422c3](https://github.com/reservoirprotocol/indexer/commit/32422c3d28bd8d45ebe6aa937dc4713fd630f0de))


### Features

* added onSaleCount to attributes/explore ([5eab04f](https://github.com/reservoirprotocol/indexer/commit/5eab04f5dbab1f070c354c95762cf691f01e7e4f))



## [5.81.32](https://github.com/reservoirprotocol/indexer/compare/v5.81.31...v5.81.32) (2022-06-03)


### Features

* use sdk methods for router filling ([06ea1a6](https://github.com/reservoirprotocol/indexer/commit/06ea1a65ee92e7199e271b7d64d9abdd9e03cf0c))


### Performance Improvements

* remove join on orders in the token floor ask events api ([e149cbe](https://github.com/reservoirprotocol/indexer/commit/e149cbecc7436d61115981febaba86850aadf04a))



## [5.81.31](https://github.com/reservoirprotocol/indexer/compare/v5.81.30...v5.81.31) (2022-06-02)


### Features

* fix missing collection logic ([2c6ed8e](https://github.com/reservoirprotocol/indexer/commit/2c6ed8ef9f33bb06856a420676f30813f687fdc8))
* fixed migration ([aa43f94](https://github.com/reservoirprotocol/indexer/commit/aa43f94b23ecb1d66a29f0419b92cffaab8e8370))



## [5.81.30](https://github.com/reservoirprotocol/indexer/compare/v5.81.29...v5.81.30) (2022-06-02)


### Features

* increase fix collection concurrency ([3c20d55](https://github.com/reservoirprotocol/indexer/commit/3c20d552a2956f329965e04d7a476e456bf7f640))



## [5.81.29](https://github.com/reservoirprotocol/indexer/compare/v5.81.28...v5.81.29) (2022-06-02)


### Features

* improved backfill ([85e206c](https://github.com/reservoirprotocol/indexer/commit/85e206cb4c9958a57d496e55b9a2827dc244d127))
* increase activity queue concurrency ([60fe118](https://github.com/reservoirprotocol/indexer/commit/60fe1180ca3a734da48217249b68dc6c08915618))
* update floorSaleChange to include 7day and 30day ([479fa20](https://github.com/reservoirprotocol/indexer/commit/479fa20055b797a9a4fc3ae6955bba46d70eadbd))



## [5.81.28](https://github.com/reservoirprotocol/indexer/compare/v5.81.27...v5.81.28) (2022-06-01)


### Features

* added floorSaleChange to collections/v4 api ([927771b](https://github.com/reservoirprotocol/indexer/commit/927771b97a8ee1d1cd6c7e99ffdf645640dcf34b))
* backfill improv ([2fac298](https://github.com/reservoirprotocol/indexer/commit/2fac29817afd30fbad8c28f1e7b056df772914ef))
* fix activity api validation ([abb13cd](https://github.com/reservoirprotocol/indexer/commit/abb13cd7556eb2b4b3edc5b5a9bc153b89fcf556))



## [5.81.27](https://github.com/reservoirprotocol/indexer/compare/v5.81.26...v5.81.27) (2022-06-01)


### Features

* updated delay ([09284bc](https://github.com/reservoirprotocol/indexer/commit/09284bcbb6c64b0bab7c8f6e1b0500517e7de468))
* updated delay ([d6ff513](https://github.com/reservoirprotocol/indexer/commit/d6ff513a347bc49001ddcc1e3a9a9d5ea2bb2150))



## [5.81.26](https://github.com/reservoirprotocol/indexer/compare/v5.81.25...v5.81.26) (2022-06-01)


### Features

* fix continuation logic ([33c88e2](https://github.com/reservoirprotocol/indexer/commit/33c88e210ad69634c2301ffb8f60b12827389fe9))



## [5.81.25](https://github.com/reservoirprotocol/indexer/compare/v5.81.24...v5.81.25) (2022-06-01)


### Features

* add unsync support ([1ea8419](https://github.com/reservoirprotocol/indexer/commit/1ea841977d4f186084776344c665644b22ba28e6))
* added get collection activity api ([87e9da6](https://github.com/reservoirprotocol/indexer/commit/87e9da60f376a0bb4008a48a08370b812f97dcc1))
* added get token/user activity api ([633030b](https://github.com/reservoirprotocol/indexer/commit/633030b5ed20fb754a1085a7e8a9b5bd30998d94))
* added get token/user activity api ([60bad34](https://github.com/reservoirprotocol/indexer/commit/60bad34239e5f2320392fb787f53b085ff230f9b))
* added listing, bid and cancel events ([1d1fb51](https://github.com/reservoirprotocol/indexer/commit/1d1fb51922a5eec389bfc05f48bcfef833bc5869))
* added log ([5c36fa2](https://github.com/reservoirprotocol/indexer/commit/5c36fa27a717f107cfba3ba39d1eb251d5eab2c8))
* added mint event support ([f32138b](https://github.com/reservoirprotocol/indexer/commit/f32138baf81ee307c2d2dfbdb0f022cf1f7c4239))
* added subject to activities table ([bc50ccf](https://github.com/reservoirprotocol/indexer/commit/bc50ccf76027e34ff7821fedf5ea45a0c23a5f63))
* added subject to activities table ([6ee4fee](https://github.com/reservoirprotocol/indexer/commit/6ee4fee681ced3aa917b71e6fe005e15a7d2c490))
* added support for transfer events ([d25f555](https://github.com/reservoirprotocol/indexer/commit/d25f5555bb340177822ae3ca5d8494c07869fd6e))
* allow nulls ([0523377](https://github.com/reservoirprotocol/indexer/commit/0523377cbfc572f6907fa9797f3664bf9e65da62))
* block hash fix ([a4cd84a](https://github.com/reservoirprotocol/indexer/commit/a4cd84a9274eb565271d9efcb65a9b0a1bbc7b9f))
* change api location and add data to the response, added new api for scraping activities ([3b137fe](https://github.com/reservoirprotocol/indexer/commit/3b137feb08f6bcfc7a957adde14a77f549a5068c))
* change api location and add data to the response, added new api for scraping activities ([604d926](https://github.com/reservoirprotocol/indexer/commit/604d926588449b4e38526bbffae428c1de31d51f))
* clone the objects ([8f63e7a](https://github.com/reservoirprotocol/indexer/commit/8f63e7a30bd02ef4e7d27c40ce0dcbbc73658851))
* fix bid cancel logic ([1ebe311](https://github.com/reservoirprotocol/indexer/commit/1ebe31169be53af21bfa811271a385d568f81e8b))
* fix cancel logic ([e90981e](https://github.com/reservoirprotocol/indexer/commit/e90981eb959a396ddf767960fdff3bb3961d825f))
* fix duplicate import ([bd9a7ba](https://github.com/reservoirprotocol/indexer/commit/bd9a7bafd0b82f323a1e60fdf96f250155ce1ff5))
* fix insert activity ([5b61d02](https://github.com/reservoirprotocol/indexer/commit/5b61d0234de95f4345b2cbc06c534e5daf00269b))
* fix retry logic ([cb91aa8](https://github.com/reservoirprotocol/indexer/commit/cb91aa869ba7177e2912f83d9234911c90dd2c8c))
* fix retry logic ([3a1bb5a](https://github.com/reservoirprotocol/indexer/commit/3a1bb5ad0f62bff7cc66fc908a027088bb23f3a5))
* fix retry logic ([d7a61c7](https://github.com/reservoirprotocol/indexer/commit/d7a61c7e2590a1c0362bba0459a0b90ba11732b3))
* fix retry logic ([4ea38e7](https://github.com/reservoirprotocol/indexer/commit/4ea38e7ca3c022abbed4376fa4d26d3919482f5f))
* fix retry logic ([bf9b114](https://github.com/reservoirprotocol/indexer/commit/bf9b1140828058449071c2739d6d22302fe70ff6))
* fixed job pulish ([c1ff18d](https://github.com/reservoirprotocol/indexer/commit/c1ff18d809db77e513a3e1de5404361e050926a5))
* missing include ([f2f2d31](https://github.com/reservoirprotocol/indexer/commit/f2f2d31724c060f8e2df8721948a147b5eea7451))
* missing price for sale activity ([c050af1](https://github.com/reservoirprotocol/indexer/commit/c050af169adcf32075f2ec7c5895474fda88af18))
* removed logs ([d45fb9d](https://github.com/reservoirprotocol/indexer/commit/d45fb9d641fea4beeaf88e89f0aa0dd28476a201))
* return unique transactions for token activity ([30ccf26](https://github.com/reservoirprotocol/indexer/commit/30ccf2672b13cf900ce3174b62ea34fe8e3e5bc3))
* set activity by event ([b66ee03](https://github.com/reservoirprotocol/indexer/commit/b66ee036fa7b233387df1a84150106f795c1bcea))
* split to multiple tables ([89a8bf3](https://github.com/reservoirprotocol/indexer/commit/89a8bf35d26551e0c7f4866460c41c06835f4af7))
* update cancel impl, added missing collection logic ([745a5a5](https://github.com/reservoirprotocol/indexer/commit/745a5a5b3904e5a3632aebf159860b6cdb9b28ca))
* update docs ([ee9a8da](https://github.com/reservoirprotocol/indexer/commit/ee9a8daff4c73ccb877d46e00dff14ca7494e4db))
* update query ([cee7427](https://github.com/reservoirprotocol/indexer/commit/cee7427914eb3dcc2460738a317b1248f41b76de))
* use blockchain timestamp for on chain events ([8d80ea5](https://github.com/reservoirprotocol/indexer/commit/8d80ea515aa4023cc80e839e7bd927b0ef713ca8))
* wip ([7515f3f](https://github.com/reservoirprotocol/indexer/commit/7515f3f27839aa977a385e3e9dac6a391cc7a6a4))
* wip ([714c931](https://github.com/reservoirprotocol/indexer/commit/714c931cffd6f04268e4168c1806de11ac90f6b9))
* wip ([5967f39](https://github.com/reservoirprotocol/indexer/commit/5967f394181f3b019aa060a18cc6353fd30cc632))
* wip ([f0945fc](https://github.com/reservoirprotocol/indexer/commit/f0945fc5a57dedd400666ac1727c174af30c29a5))
* wip ([5173e1b](https://github.com/reservoirprotocol/indexer/commit/5173e1b8c975b2736623f1b5dd5012dadeee22a6))
* wip ([d2b9100](https://github.com/reservoirprotocol/indexer/commit/d2b910092129329d3b9dcc6f1c4da16c14348b25))



## [5.81.24](https://github.com/reservoirprotocol/indexer/compare/v5.81.23...v5.81.24) (2022-06-01)


### Features

* collections v4 10s cache ([e8dae31](https://github.com/reservoirprotocol/indexer/commit/e8dae315c94209433b5d0729ba9ce8b0c9313d59))
* default 1s cache ([788e027](https://github.com/reservoirprotocol/indexer/commit/788e027f4233fd6252f422119c7603a4bea7bcee))
* fixed acquired at logic ([e4ef557](https://github.com/reservoirprotocol/indexer/commit/e4ef5578076ec1cf67bcf08ba7a0b6e76cf5012e))
* hour cache on owners ([03be440](https://github.com/reservoirprotocol/indexer/commit/03be440f53e8688e182d0b33c0fbd118e1b25867))
* owners cache ([e92a88e](https://github.com/reservoirprotocol/indexer/commit/e92a88e0ac42df1c2bf9e58fe77c760a0bcd1fc0))
* updated delay ([3ffa13e](https://github.com/reservoirprotocol/indexer/commit/3ffa13eb2d86e49832b186ddef0907c151298d07))



## [5.81.23](https://github.com/reservoirprotocol/indexer/compare/v5.81.22...v5.81.23) (2022-05-31)


### Performance Improvements

* improve user tokens api performance when filtering by community or collection set ([68ff3fe](https://github.com/reservoirprotocol/indexer/commit/68ff3fed4be4a34a025bc781f719f771badc9ef1))



## [5.81.22](https://github.com/reservoirprotocol/indexer/compare/v5.81.21...v5.81.22) (2022-05-30)


### Bug Fixes

* normalize 0xv4 prices to include the fee where order is available ([1472eeb](https://github.com/reservoirprotocol/indexer/commit/1472eeba49394055d6d248b6fe2884f6b89172da))



## [5.81.21](https://github.com/reservoirprotocol/indexer/compare/v5.81.20...v5.81.21) (2022-05-30)


### Bug Fixes

* unattributed reservoir sales ([40d0625](https://github.com/reservoirprotocol/indexer/commit/40d0625f5e4d2aeb8c9fd97f5e1a0e5204c8db16))



## [5.81.20](https://github.com/reservoirprotocol/indexer/compare/v5.81.19...v5.81.20) (2022-05-30)


### Bug Fixes

* execute bid fee handling ([b2d0adb](https://github.com/reservoirprotocol/indexer/commit/b2d0adb47e3e05db6e008dd972daa93ae4e33ab8))



## [5.81.19](https://github.com/reservoirprotocol/indexer/compare/v5.81.18...v5.81.19) (2022-05-30)


### Performance Improvements

* improve user tokens api when filtering by single collection ([1921131](https://github.com/reservoirprotocol/indexer/commit/19211310644d69ec05233f5feb2aa36e12c935aa))



## [5.81.18](https://github.com/reservoirprotocol/indexer/compare/v5.81.17...v5.81.18) (2022-05-30)


### Bug Fixes

* delay attribute caches updates by 10 minutes ([8f1fceb](https://github.com/reservoirprotocol/indexer/commit/8f1fcebf8b4e3caa2fdaccc64460bd11b410e44d))


### Features

* resync attribute caches on collection refresh ([0bd8f0a](https://github.com/reservoirprotocol/indexer/commit/0bd8f0a9982b67809d21e30cef6706b90735413b))


### Performance Improvements

* increase concurrency on the order fixes queue ([ec363db](https://github.com/reservoirprotocol/indexer/commit/ec363dbf76952450394955ea2751f09936baa803))



## [5.81.17](https://github.com/reservoirprotocol/indexer/compare/v5.81.16...v5.81.17) (2022-05-30)


### Features

* make order cancel/fill check optional ([e75243b](https://github.com/reservoirprotocol/indexer/commit/e75243b4db4b0eab9ae9c98be6a440348452ada6))



## [5.81.16](https://github.com/reservoirprotocol/indexer/compare/v5.81.15...v5.81.16) (2022-05-30)


### Bug Fixes

* invalid bignumber ([5af68c4](https://github.com/reservoirprotocol/indexer/commit/5af68c4a8cb6a4e675f1d05f3f39723af4df4327))


### Features

* correctly validate orders ([a454c98](https://github.com/reservoirprotocol/indexer/commit/a454c983f0ad1ab06cdb418c013abe2f99ab7692))



## [5.81.15](https://github.com/reservoirprotocol/indexer/compare/v5.81.14...v5.81.15) (2022-05-27)


### Bug Fixes

* looksrare order posting ([586e3ad](https://github.com/reservoirprotocol/indexer/commit/586e3ad1931fd49d07b18afe665e109ec2dda97a))



## [5.81.14](https://github.com/reservoirprotocol/indexer/compare/v5.81.13...v5.81.14) (2022-05-27)


### Bug Fixes

* skip empty collection royalties when building order ([b0b4de4](https://github.com/reservoirprotocol/indexer/commit/b0b4de42f7b9548013d7f1d4c9e745d982aa308d))



## [5.81.13](https://github.com/reservoirprotocol/indexer/compare/v5.81.12...v5.81.13) (2022-05-27)


### Bug Fixes

* allow empty collection slugs ([fff0818](https://github.com/reservoirprotocol/indexer/commit/fff08189b9f35f1a11057b3cd58a4240a55ef286))
* compare prices instead of order ids ([8fd3690](https://github.com/reservoirprotocol/indexer/commit/8fd36905ebf7aa1e29651c47ffa1ba4e95f04974))


### Features

* support skipping reverts on multi listing fill ([884cfd4](https://github.com/reservoirprotocol/indexer/commit/884cfd40f92c5743514b59fa081d12b30c6c38dd))



## [5.81.12](https://github.com/reservoirprotocol/indexer/compare/v5.81.11...v5.81.12) (2022-05-27)


### Bug Fixes

* correct admin api for resyncing floor-ask events ([75ab309](https://github.com/reservoirprotocol/indexer/commit/75ab3098f3ba26ab415753323282d94ce59d2478))



## [5.81.11](https://github.com/reservoirprotocol/indexer/compare/v5.81.10...v5.81.11) (2022-05-27)


### Bug Fixes

* add missing alias in query ([4338d30](https://github.com/reservoirprotocol/indexer/commit/4338d30dbbd3107aeb4c4df33e63ef3ed0a26211))
* ensure all token cache updates go through the order updates by id queue ([cde1531](https://github.com/reservoirprotocol/indexer/commit/cde1531723c3f428eccaee45fc5f3ea73c389513))
* minor tweaks to the admin floor events resync api ([40a34ca](https://github.com/reservoirprotocol/indexer/commit/40a34caa8ed1ee76b64bde4adebe9ea36ba4d5ef))


### Features

* add api to resync any missing token floor-ask events ([5c1474e](https://github.com/reservoirprotocol/indexer/commit/5c1474e77dca532c8cf28b2ec5813028d1940fb2))



## [5.81.10](https://github.com/reservoirprotocol/indexer/compare/v5.81.9...v5.81.10) (2022-05-27)


### Performance Improvements

* allow concurrency when flushing transfer events ([351f44a](https://github.com/reservoirprotocol/indexer/commit/351f44ac6070e1798f9b55fac5e52e5165029e01))



## [5.81.9](https://github.com/reservoirprotocol/indexer/compare/v5.81.8...v5.81.9) (2022-05-26)


### Bug Fixes

* correct side detection for looksrare orders ([790de3f](https://github.com/reservoirprotocol/indexer/commit/790de3fefbcd20df336415e4dbf0763f6e9131ac))



## [5.81.8](https://github.com/reservoirprotocol/indexer/compare/v5.81.7...v5.81.8) (2022-05-26)


### Bug Fixes

* properly attribute fills through the router ([ff0dc41](https://github.com/reservoirprotocol/indexer/commit/ff0dc419c0a1404b38bcc6b5a7415abe9211c3d4))



## [5.81.7](https://github.com/reservoirprotocol/indexer/compare/v5.81.6...v5.81.7) (2022-05-26)


### Bug Fixes

* avoid deadlocks ([fe27283](https://github.com/reservoirprotocol/indexer/commit/fe272837014d14920bc3f4607679ddde38496c5a))



## [5.81.6](https://github.com/reservoirprotocol/indexer/compare/v5.81.5...v5.81.6) (2022-05-26)


### Bug Fixes

* correct liquidity mode detection ([5d8a387](https://github.com/reservoirprotocol/indexer/commit/5d8a3875f60116cca3c34add1eb95f29bb166c04))



## [5.81.5](https://github.com/reservoirprotocol/indexer/compare/v5.81.4...v5.81.5) (2022-05-26)


### Features

* support running in liquidity-only mode ([9350a29](https://github.com/reservoirprotocol/indexer/commit/9350a293a09ac76419556a3fda4ee6a04567c852))



## [5.81.4](https://github.com/reservoirprotocol/indexer/compare/v5.81.3...v5.81.4) (2022-05-26)


### Features

* update refresh actions for large collections ([17c1d15](https://github.com/reservoirprotocol/indexer/commit/17c1d15c6617621f4cc7f6df6548742c7c83f305))



## [5.81.3](https://github.com/reservoirprotocol/indexer/compare/v5.81.2...v5.81.3) (2022-05-26)


### Bug Fixes

* correct from/to fields in the sales api ([107b147](https://github.com/reservoirprotocol/indexer/commit/107b1470e6f31962854616711771ff5174854273))



## [5.81.2](https://github.com/reservoirprotocol/indexer/compare/v5.81.1...v5.81.2) (2022-05-25)


### Features

* enabled backfill v2 ([b34e4ed](https://github.com/reservoirprotocol/indexer/commit/b34e4ed980045e95a881d086909a036c3b69f9e8))



## [5.81.1](https://github.com/reservoirprotocol/indexer/compare/v5.81.0...v5.81.1) (2022-05-25)


### Bug Fixes

* revert gmoney source logo ([aaf73e9](https://github.com/reservoirprotocol/indexer/commit/aaf73e9ad7662f144f65fc68803fb12715751685))


### Features

* tweak some sources ([4dc96c2](https://github.com/reservoirprotocol/indexer/commit/4dc96c2c4f30582b9fe43ae1f05df3f3f1bca903))



# [5.81.0](https://github.com/reservoirprotocol/indexer/compare/v5.80.13...v5.81.0) (2022-05-25)


### Features

* update url ([80f2cb3](https://github.com/reservoirprotocol/indexer/commit/80f2cb3f1392818f73488dd6f358da6be191a208))



## [5.80.13](https://github.com/reservoirprotocol/indexer/compare/v5.80.12...v5.80.13) (2022-05-25)


### Features

* added migration file ([fd8d938](https://github.com/reservoirprotocol/indexer/commit/fd8d938644a10b1dec07fce5ce7bc262bc6bfcb6))
* api to create new set for collections ([53fbda3](https://github.com/reservoirprotocol/indexer/commit/53fbda3ed0b880391cf65aad85dab4eadb3f9165))
* update APIs to support collectionSetId ([0dfa049](https://github.com/reservoirprotocol/indexer/commit/0dfa049b1094ec5a3840f472fdc95014fc295bbc))
* update filename ([3cbf565](https://github.com/reservoirprotocol/indexer/commit/3cbf565b989565340281014207c895dd3287dafd))



## [5.80.12](https://github.com/reservoirprotocol/indexer/compare/v5.80.11...v5.80.12) (2022-05-25)


### Bug Fixes

* trigger metadata fetching for all newly minted tokens ([961a743](https://github.com/reservoirprotocol/indexer/commit/961a743472e7e0703ec6cb31df863da0fb2917c0))



## [5.80.11](https://github.com/reservoirprotocol/indexer/compare/v5.80.10...v5.80.11) (2022-05-25)


### Bug Fixes

* always retry fetching tokens collection ([7a95e71](https://github.com/reservoirprotocol/indexer/commit/7a95e71959c6784a539c6e1d1a766a1fe7aba6e9))
* properly insert newly minted tokens to collection-wide token sets ([b52a3d9](https://github.com/reservoirprotocol/indexer/commit/b52a3d93885d258e23f9e593d220d4e23b711fd5))



## [5.80.10](https://github.com/reservoirprotocol/indexer/compare/v5.80.9...v5.80.10) (2022-05-24)


### Bug Fixes

* fixed typo ([ad28acf](https://github.com/reservoirprotocol/indexer/commit/ad28acf48cce58ce6f5ebfaa54483e0db52b409e))



## [5.80.9](https://github.com/reservoirprotocol/indexer/compare/v5.80.8...v5.80.9) (2022-05-24)


### Features

* updated limit ([db0e095](https://github.com/reservoirprotocol/indexer/commit/db0e0951b2c5201fa100d3927708f3a23211496e))



## [5.80.8](https://github.com/reservoirprotocol/indexer/compare/v5.80.7...v5.80.8) (2022-05-24)


### Features

* add support for filling x2y2 listings ([565feae](https://github.com/reservoirprotocol/indexer/commit/565feae246228829fcfbc7b1ef28596ff381ab30))



## [5.80.7](https://github.com/reservoirprotocol/indexer/compare/v5.80.6...v5.80.7) (2022-05-24)


### Features

* added missing import ([c6ae364](https://github.com/reservoirprotocol/indexer/commit/c6ae364e277fe0d2b756b9108dffaa90865bca1b))



## [5.80.6](https://github.com/reservoirprotocol/indexer/compare/v5.80.5...v5.80.6) (2022-05-24)


### Features

* enabled acquired at backfill ([4292f90](https://github.com/reservoirprotocol/indexer/commit/4292f90b43fbaceb75ad84a9053abb29fb55cd60))



## [5.80.5](https://github.com/reservoirprotocol/indexer/compare/v5.80.4...v5.80.5) (2022-05-24)


### Bug Fixes

* correct off-chain validation for x2y2 orders ([1234e15](https://github.com/reservoirprotocol/indexer/commit/1234e15ab0b27c43ae3035c59012b5bca4c9f2d7))



## [5.80.4](https://github.com/reservoirprotocol/indexer/compare/v5.80.3...v5.80.4) (2022-05-24)


### Bug Fixes

* use proper eth address for x2y2 ([0b1dc14](https://github.com/reservoirprotocol/indexer/commit/0b1dc143beaddcb5058d828dba9df315bf6d51bb))



## [5.80.3](https://github.com/reservoirprotocol/indexer/compare/v5.80.2...v5.80.3) (2022-05-24)


### Features

* add support for x2y2 listings ([d4cc97f](https://github.com/reservoirprotocol/indexer/commit/d4cc97f7398bc2186c5bd81a698ebb8a500acbec))
* support processing x2y2 orders ([2aea250](https://github.com/reservoirprotocol/indexer/commit/2aea250be451cc9f70b8bf4d67192d485486d9e5))



## [5.80.2](https://github.com/reservoirprotocol/indexer/compare/v5.80.1...v5.80.2) (2022-05-23)


### Bug Fixes

* lower limit for dynamic orders update queue ([8d69bf1](https://github.com/reservoirprotocol/indexer/commit/8d69bf1c2995ca97f7c8d328d031482f729bd6e8))



## [5.80.1](https://github.com/reservoirprotocol/indexer/compare/v5.80.0...v5.80.1) (2022-05-23)


### Features

* added migration ([a0a16a9](https://github.com/reservoirprotocol/indexer/commit/a0a16a91177752cf0d99d8c63b4a54fe07840eab))
* disabled v2 floor sale changed until backfill ([f192dfe](https://github.com/reservoirprotocol/indexer/commit/f192dfedc4b32edf62ccc482faef58c7699dd265))
* disabling backfills ([32be4a7](https://github.com/reservoirprotocol/indexer/commit/32be4a74106c67816e7bb673a59597d7ac303a05))
* fixed typo ([b182cc5](https://github.com/reservoirprotocol/indexer/commit/b182cc505457fe3d0e80303a09cd8d60ef977190))



# [5.80.0](https://github.com/reservoirprotocol/indexer/compare/v5.79.1...v5.80.0) (2022-05-23)


### Features

* add log index and batch index to sales / bulk sales / transfers ([ad2bf3c](https://github.com/reservoirprotocol/indexer/commit/ad2bf3c49d7b01b11801767feef8757325f93763))



## [5.79.1](https://github.com/reservoirprotocol/indexer/compare/v5.79.0...v5.79.1) (2022-05-23)


### Bug Fixes

* add one more delayed job to check block ([fac3933](https://github.com/reservoirprotocol/indexer/commit/fac3933cc298a72d8d2c80a3558d756abaf23f82))


### Features

* added events file migration ([58f066c](https://github.com/reservoirprotocol/indexer/commit/58f066cbe6b765b09f328d9bebab2e61a340eb1c))
* added events indexes ([157b991](https://github.com/reservoirprotocol/indexer/commit/157b991a264973e8ff6611979baf068c9a8fad9f))
* added events indexes ([d16991b](https://github.com/reservoirprotocol/indexer/commit/d16991b7204cf1d140a9b11ed83a0d91e903b721))
* added sale activity handler ([823d356](https://github.com/reservoirprotocol/indexer/commit/823d3567b09abf79524f0da4a8de031652c8c8b7))
* added support to record sale event ([14bbbcf](https://github.com/reservoirprotocol/indexer/commit/14bbbcfa4a5588db0777ca63fb311fe74eebfed9))
* added update floor price and backfill logic ([9210826](https://github.com/reservoirprotocol/indexer/commit/9210826ef90ac2a9a235fe4c25f833ba2ae91ecc))
* added update floor price and backfill logic ([f3b5d74](https://github.com/reservoirprotocol/indexer/commit/f3b5d74daf20ac8648838504b609d90be93893a5))
* address pr feedback ([a4f0462](https://github.com/reservoirprotocol/indexer/commit/a4f0462e09971409218038b5b867268b046373ca))
* change Events to Activities ([89a204c](https://github.com/reservoirprotocol/indexer/commit/89a204cddc0582961b8dbe112fb31a2c72ca866c))
* delay update ([4bf672c](https://github.com/reservoirprotocol/indexer/commit/4bf672c94effe207b16360ba6964f32ab36b0305))
* disabled backfill ([1303dd1](https://github.com/reservoirprotocol/indexer/commit/1303dd1c6871ddc43fc02b7132aeb775eb4011a5))
* enabled backfill ([5fe4c63](https://github.com/reservoirprotocol/indexer/commit/5fe4c63c029dac6e67c2d6e2b7d46513a26d5343))
* fix activity insertion ([99828b0](https://github.com/reservoirprotocol/indexer/commit/99828b06cc246b17fe29fef1c0e15de5b2825b9b))
* fix migration ([c05781e](https://github.com/reservoirprotocol/indexer/commit/c05781e992459723aabee975efb9e0e1f1a6735f))
* improved backfill query ([b804f25](https://github.com/reservoirprotocol/indexer/commit/b804f2514bb13192302be88047989ff8447e3710))
* pr feedback ([b323bda](https://github.com/reservoirprotocol/indexer/commit/b323bdaee608f1107e5c2342e440c0bd3b18a9d5))
* pr feedback ([9bf0c24](https://github.com/reservoirprotocol/indexer/commit/9bf0c24f6c52e2f83f4a71c51908a99d27965774))
* removed migration ([22aa163](https://github.com/reservoirprotocol/indexer/commit/22aa1637a2bfe4df8285ddb3458c885db32435df))
* unique transaction id ([f1a6f15](https://github.com/reservoirprotocol/indexer/commit/f1a6f15779649f7a5f6b3384339773f2e38b011e))
* update transaction id hash ([c3cc95f](https://github.com/reservoirprotocol/indexer/commit/c3cc95fe5e445fba4c26bc52e5bc5ac033a25df6))
* updated delay ([1777cf2](https://github.com/reservoirprotocol/indexer/commit/1777cf2f0ef5e31281e2ec93ee2e758e2cf11b86))
* updated limit ([eb75d89](https://github.com/reservoirprotocol/indexer/commit/eb75d89eddbdd934deb890ce5fc9df9f0664e380))
* wip ([e74f050](https://github.com/reservoirprotocol/indexer/commit/e74f0503f0797ad7af24bd95b37e570eb90ab849))
* wip ([f191f81](https://github.com/reservoirprotocol/indexer/commit/f191f81e7861406b761e33e3d8478972ea5615d0))



# [5.79.0](https://github.com/reservoirprotocol/indexer/compare/v5.78.9...v5.79.0) (2022-05-23)


### Features

* cache on user tokens ([66b44f1](https://github.com/reservoirprotocol/indexer/commit/66b44f10b459947e9868225908867cb1edd22e5d))
* lower rate limit ([6b88b0c](https://github.com/reservoirprotocol/indexer/commit/6b88b0cb08f06f9ab6a8aaf6f9e2c133f8d742e2))



## [5.78.9](https://github.com/reservoirprotocol/indexer/compare/v5.78.8...v5.78.9) (2022-05-22)


### Features

* re-enable order fixes on collection refresh ([49e4621](https://github.com/reservoirprotocol/indexer/commit/49e4621a3b78b02b9eaa1de54e7b4254d1f3aee1))



## [5.78.8](https://github.com/reservoirprotocol/indexer/compare/v5.78.7...v5.78.8) (2022-05-22)


### Bug Fixes

* efficient order fix by contract ([1a98506](https://github.com/reservoirprotocol/indexer/commit/1a985065754a7b7348989fd05469fac47f817d14))



## [5.78.7](https://github.com/reservoirprotocol/indexer/compare/v5.78.6...v5.78.7) (2022-05-22)


### Bug Fixes

* allow multiple jobs for the same block but with different delays ([60d8f6a](https://github.com/reservoirprotocol/indexer/commit/60d8f6a39f715dd83e2716cb8961839030bfcb21))
* integrate block checking queue ([b0767cc](https://github.com/reservoirprotocol/indexer/commit/b0767ccccdc7c8fd3fe21de48343b168e67078c8))



## [5.78.6](https://github.com/reservoirprotocol/indexer/compare/v5.78.5...v5.78.6) (2022-05-22)


### Bug Fixes

* deterministic sorting for the owners api ([4345161](https://github.com/reservoirprotocol/indexer/commit/434516110126cd650928ae7320f85cf9148c0fae))



## [5.78.5](https://github.com/reservoirprotocol/indexer/compare/v5.78.4...v5.78.5) (2022-05-22)


### Bug Fixes

* use deterministic sorting for the owners api ([2e7e4b5](https://github.com/reservoirprotocol/indexer/commit/2e7e4b5e852016b5f05a956850d826774df1c3d7))



## [5.78.4](https://github.com/reservoirprotocol/indexer/compare/v5.78.3...v5.78.4) (2022-05-22)


### Bug Fixes

* order invalidation sql ([95a6d6b](https://github.com/reservoirprotocol/indexer/commit/95a6d6bb69b852bc14925b39f867b9243747f384))



## [5.78.3](https://github.com/reservoirprotocol/indexer/compare/v5.78.2...v5.78.3) (2022-05-21)


### Bug Fixes

* deterministic looksrare order listing ([52b4c8b](https://github.com/reservoirprotocol/indexer/commit/52b4c8b98312453b7165f1a441381a5af0fccf8d))



## [5.78.2](https://github.com/reservoirprotocol/indexer/compare/v5.78.1...v5.78.2) (2022-05-21)


### Bug Fixes

* use correct header name for looksrare api key ([502ac6f](https://github.com/reservoirprotocol/indexer/commit/502ac6fa6997670eb921d4aff1743fdfface947e))



## [5.78.1](https://github.com/reservoirprotocol/indexer/compare/v5.78.0...v5.78.1) (2022-05-21)


### Bug Fixes

* correct approval operator when listing to looksrare ([0763f6f](https://github.com/reservoirprotocol/indexer/commit/0763f6f8407e36a734ec9f792bb37109ccd7a181))



# [5.78.0](https://github.com/reservoirprotocol/indexer/compare/v5.77.0...v5.78.0) (2022-05-20)


### Features

* prioritize single token refresh ([6203ddd](https://github.com/reservoirprotocol/indexer/commit/6203ddd862e9a49ad071d9011cadef8cbc8b8e30))



# [5.77.0](https://github.com/reservoirprotocol/indexer/compare/v5.76.0...v5.77.0) (2022-05-20)


### Features

* fix collection filter for user tokens ([8a847ab](https://github.com/reservoirprotocol/indexer/commit/8a847ab8bf18c7ab27334ef0814e24e57b2d9848))



# [5.76.0](https://github.com/reservoirprotocol/indexer/compare/v5.75.4...v5.76.0) (2022-05-20)


### Features

* allow remove from community ([8cafecb](https://github.com/reservoirprotocol/indexer/commit/8cafecb30353f1809d84da6f0d9a623e25e0ac85))



## [5.75.4](https://github.com/reservoirprotocol/indexer/compare/v5.75.3...v5.75.4) (2022-05-20)



## [5.75.3](https://github.com/reservoirprotocol/indexer/compare/v5.75.2...v5.75.3) (2022-05-20)


### Bug Fixes

* add missing query param ([fc44526](https://github.com/reservoirprotocol/indexer/commit/fc445265665b6c67f91f26b9b3013fc0ecba032e))
* revert api changes until backfill is done ([a166ad1](https://github.com/reservoirprotocol/indexer/commit/a166ad17441d4f0dc3380fe64a2bab4a79698c9d))


### Features

* add backfill job for token floor ask events ([49af64b](https://github.com/reservoirprotocol/indexer/commit/49af64b1fa6dfb4f12981e7b97b02105fe2c0df4))
* remove orders table join in the tokens floor ask events api ([704c3f9](https://github.com/reservoirprotocol/indexer/commit/704c3f904d346bccde2fec226f84ad19ef956619))



## [5.75.2](https://github.com/reservoirprotocol/indexer/compare/v5.75.1...v5.75.2) (2022-05-20)


### Bug Fixes

* allow owner to be null in the tokens api ([5072be0](https://github.com/reservoirprotocol/indexer/commit/5072be0c731c299bd41bc7b05b0351474b289029))



## [5.75.1](https://github.com/reservoirprotocol/indexer/compare/v5.75.0...v5.75.1) (2022-05-20)


### Bug Fixes

* add missing comma ([12752f6](https://github.com/reservoirprotocol/indexer/commit/12752f6fc799a3a81b967249776b3b1d14946eb5))
* return missing nonce column from query ([0b721d3](https://github.com/reservoirprotocol/indexer/commit/0b721d3794da9724a4c48d0a75acd9fe0f4a75e1))


### Features

* cache some more fields on the token floor ask events table ([8002d6e](https://github.com/reservoirprotocol/indexer/commit/8002d6ef114d5d67242b43b1e80551e7dd2f6bb7))



# [5.75.0](https://github.com/reservoirprotocol/indexer/compare/v5.74.1...v5.75.0) (2022-05-20)


### Features

* lower rate limit ([b41fd03](https://github.com/reservoirprotocol/indexer/commit/b41fd03abe6a1f53cd943d4feebf2c1bda48818c))



## [5.74.1](https://github.com/reservoirprotocol/indexer/compare/v5.74.0...v5.74.1) (2022-05-20)


### Features

* lower rate limit ([264bdd5](https://github.com/reservoirprotocol/indexer/commit/264bdd5d590934622505a6d4169c493681945017))



# [5.74.0](https://github.com/reservoirprotocol/indexer/compare/v5.73.0...v5.74.0) (2022-05-20)


### Features

* lower rate limit ([715e6ae](https://github.com/reservoirprotocol/indexer/commit/715e6ae9cd058f48d11ce65ba5b38f913d60ccb2))



# [5.73.0](https://github.com/reservoirprotocol/indexer/compare/v5.72.0...v5.73.0) (2022-05-19)


### Features

* stop full collections tokens refresh ([3c3aeb6](https://github.com/reservoirprotocol/indexer/commit/3c3aeb67f0f6651ce94aa85ce69994075389da1f))



# [5.72.0](https://github.com/reservoirprotocol/indexer/compare/v5.71.0...v5.72.0) (2022-05-19)


### Features

* update limit on large collections refresh ([6644f4a](https://github.com/reservoirprotocol/indexer/commit/6644f4a8e70321882854b19c985a0c456604d109))



# [5.71.0](https://github.com/reservoirprotocol/indexer/compare/v5.70.3...v5.71.0) (2022-05-19)


### Features

* added owner to tokens API ([4fd86d1](https://github.com/reservoirprotocol/indexer/commit/4fd86d12083b4a0b90803e69120e484296397681))



## [5.70.3](https://github.com/reservoirprotocol/indexer/compare/v5.70.2...v5.70.3) (2022-05-19)


### Bug Fixes

* removed redundant sort ([da8f33f](https://github.com/reservoirprotocol/indexer/commit/da8f33f895efbc1a818176dd7cca43a5f9d298fc))



## [5.70.2](https://github.com/reservoirprotocol/indexer/compare/v5.70.1...v5.70.2) (2022-05-19)


### Bug Fixes

* set various cache information on newly minted tokens ([7293028](https://github.com/reservoirprotocol/indexer/commit/72930285f6f37b063e2cae5138652b40fbcaaac3))


### Features

* use disabled status when invalidating an order ([d2364d8](https://github.com/reservoirprotocol/indexer/commit/d2364d8a671cef5575af7b98dec932a5c1522609))



## [5.70.1](https://github.com/reservoirprotocol/indexer/compare/v5.70.0...v5.70.1) (2022-05-19)


### Features

* add admin api for simulating the floor ask order of any token ([ca5e976](https://github.com/reservoirprotocol/indexer/commit/ca5e97659c959abcbae71e02d3911c8965c2d0b8))
* improve order executed api ([7b820ad](https://github.com/reservoirprotocol/indexer/commit/7b820ad689833b58a9425163d703013a1e03f15a))
* use the raw orders table for the execute apis ([61c6d5a](https://github.com/reservoirprotocol/indexer/commit/61c6d5a17a564f0f0f93d4da5731baed4e705808))



# [5.70.0](https://github.com/reservoirprotocol/indexer/compare/v5.69.2...v5.70.0) (2022-05-19)


### Features

* check for returned code ([087012a](https://github.com/reservoirprotocol/indexer/commit/087012afdd1c3e191db0bd84e26efacda7a1b195))



## [5.69.2](https://github.com/reservoirprotocol/indexer/compare/v5.69.1...v5.69.2) (2022-05-19)


### Features

* sync metadata requests ([c0bdb83](https://github.com/reservoirprotocol/indexer/commit/c0bdb83b0e8cb039eb4ece3498eb5ca56214737b))



## [5.69.1](https://github.com/reservoirprotocol/indexer/compare/v5.69.0...v5.69.1) (2022-05-19)


### Features

* sync metadata requests ([afbce06](https://github.com/reservoirprotocol/indexer/commit/afbce068bbbb61c2b307b2d7cf38710411d7eb5a))



# [5.69.0](https://github.com/reservoirprotocol/indexer/compare/v5.68.1...v5.69.0) (2022-05-19)


### Features

* sync metadata requests ([98112a9](https://github.com/reservoirprotocol/indexer/commit/98112a936fb86487037da88e5ebe69808205019c))



## [5.68.1](https://github.com/reservoirprotocol/indexer/compare/v5.68.0...v5.68.1) (2022-05-18)


### Features

* fix metadata write query ([df045a8](https://github.com/reservoirprotocol/indexer/commit/df045a80e050d6c2cabe982d6ddc5ee2902502eb))



# [5.68.0](https://github.com/reservoirprotocol/indexer/compare/v5.67.8...v5.68.0) (2022-05-18)


### Features

* fix metadata write query ([d4a4021](https://github.com/reservoirprotocol/indexer/commit/d4a40210af13e06d25f73b0862dc59fd0617b42a))



## [5.67.8](https://github.com/reservoirprotocol/indexer/compare/v5.67.7...v5.67.8) (2022-05-18)


### Features

* fix the order of events we sync ([90f38fb](https://github.com/reservoirprotocol/indexer/commit/90f38fb6086f44f09f152eb4054a146eb29a2d8f))



## [5.67.7](https://github.com/reservoirprotocol/indexer/compare/v5.67.6...v5.67.7) (2022-05-18)



## [5.67.6](https://github.com/reservoirprotocol/indexer/compare/v5.67.5...v5.67.6) (2022-05-18)


### Features

* create post token-sets api ([911166d](https://github.com/reservoirprotocol/indexer/commit/911166dcdddeb9b3f15cf3276f862b64c2191e96))



## [5.67.5](https://github.com/reservoirprotocol/indexer/compare/v5.67.4...v5.67.5) (2022-05-18)


### Bug Fixes

* set a maximum limit of 100 for the /orders/asks and /orders/bids apis ([94de653](https://github.com/reservoirprotocol/indexer/commit/94de6537f0009bd310c5285e29098c9d3ad51b0a))
* update missing collection ids for tokens on collection refresh ([69598e4](https://github.com/reservoirprotocol/indexer/commit/69598e48fb0f9a4a4c969a51008ece5a9cd8d0f2))



## [5.67.4](https://github.com/reservoirprotocol/indexer/compare/v5.67.3...v5.67.4) (2022-05-18)


### Bug Fixes

* skip update when no attributes are present ([1f1633e](https://github.com/reservoirprotocol/indexer/commit/1f1633ee7c6b34ff6b0b6a294d82791a6f44befe))



## [5.67.3](https://github.com/reservoirprotocol/indexer/compare/v5.67.2...v5.67.3) (2022-05-17)


### Features

* fix attribute double counting ([d3de590](https://github.com/reservoirprotocol/indexer/commit/d3de59051a3938b3235190dfc0eb02cfd7e1358e))
* fix attribute double counting ([4913ae9](https://github.com/reservoirprotocol/indexer/commit/4913ae97f631e520f631c0eaa461118f7b583b3b))
* fix attribute double counting ([048453c](https://github.com/reservoirprotocol/indexer/commit/048453c8b6da5fa0107e39082d50a77a7ec7d49c))
* fix attribute double counting ([11bceb1](https://github.com/reservoirprotocol/indexer/commit/11bceb1209ea0ecacab97b2bb37078ff72e39fa7))
* fix attribute double counting ([e5df238](https://github.com/reservoirprotocol/indexer/commit/e5df2381fa409d6e706a5fa58365d73cd467947c))
* fix attribute double counting ([58d48cb](https://github.com/reservoirprotocol/indexer/commit/58d48cbc5ead788ce39b092a277d09692548872a))
* fix attribute double counting ([765423b](https://github.com/reservoirprotocol/indexer/commit/765423b472816fc7e7d15285650b874ca2d661c5))



## [5.67.2](https://github.com/reservoirprotocol/indexer/compare/v5.67.1...v5.67.2) (2022-05-17)


### Bug Fixes

* collection wide offers via zeroex-v4 ([5250a46](https://github.com/reservoirprotocol/indexer/commit/5250a46f9aafdc785b191f6c090f32bce2051fbe))
* filling zeroex-v4/opendao buy orders ([82c83b1](https://github.com/reservoirprotocol/indexer/commit/82c83b120c0cf9e614ba57278707463b13038ad7))



## [5.67.1](https://github.com/reservoirprotocol/indexer/compare/v5.67.0...v5.67.1) (2022-05-17)


### Bug Fixes

* forward attributes for zeroex-v4/opendao orders ([4eb366f](https://github.com/reservoirprotocol/indexer/commit/4eb366f4672e5583aa6b3c36bf7dc81062155f22))
* pass attributes on /execute/bid ([ff0229c](https://github.com/reservoirprotocol/indexer/commit/ff0229ceb3f05e49675b2cb7d766f5d42a2aeef9))
* zeroex-v4 trait orders ([1ca4a6a](https://github.com/reservoirprotocol/indexer/commit/1ca4a6a3ef4bbcb6d80b88c2e76dd20c29d77d75))


### Features

* allow sorting tokens api by token id ([e18eae0](https://github.com/reservoirprotocol/indexer/commit/e18eae06fdd74560f4110bdd52ef83f99a11cd92))



# [5.67.0](https://github.com/reservoirprotocol/indexer/compare/v5.66.9...v5.67.0) (2022-05-17)


### Features

* fix migration ([e2299e7](https://github.com/reservoirprotocol/indexer/commit/e2299e759546890d8a5487ff86a5a8a1adf927ee))



## [5.66.9](https://github.com/reservoirprotocol/indexer/compare/v5.66.8...v5.66.9) (2022-05-17)


### Features

* support zeroex-v4 mainnet trait bids ([6f44865](https://github.com/reservoirprotocol/indexer/commit/6f448655de92c622c8a00f229c21837e0862beb2))



## [5.66.8](https://github.com/reservoirprotocol/indexer/compare/v5.66.7...v5.66.8) (2022-05-16)


### Features

* update volume change calc ([f7eadae](https://github.com/reservoirprotocol/indexer/commit/f7eadae79ba21682e4099b05d1e0fae42928b155))



## [5.66.7](https://github.com/reservoirprotocol/indexer/compare/v5.66.6...v5.66.7) (2022-05-16)


### Bug Fixes

* proper batch retrieval of arweave orders ([7ac480a](https://github.com/reservoirprotocol/indexer/commit/7ac480a70d34428f9870dceb3039b0c5d395d332))



## [5.66.6](https://github.com/reservoirprotocol/indexer/compare/v5.66.5...v5.66.6) (2022-05-16)


### Features

* support zeroex-v4 trait bids ([4965425](https://github.com/reservoirprotocol/indexer/commit/496542520a4fc7c324d2c3249f9e12c5a49f154e))



## [5.66.5](https://github.com/reservoirprotocol/indexer/compare/v5.66.4...v5.66.5) (2022-05-16)


### Features

* update cached floor and bid on tokens when refreshing ([fd8d223](https://github.com/reservoirprotocol/indexer/commit/fd8d223c8383dc060edcd9adbb08afd64794d344))



## [5.66.4](https://github.com/reservoirprotocol/indexer/compare/v5.66.3...v5.66.4) (2022-05-16)


### Features

* added bids and asks v2 to support multiple contracts ([dacbee3](https://github.com/reservoirprotocol/indexer/commit/dacbee315207036ebd0359410ff653bea2552a94))
* allow both contract and maker on bids and asks API ([464c707](https://github.com/reservoirprotocol/indexer/commit/464c707b89078d8f330e2a08fae0ec61c8a70698))



## [5.66.3](https://github.com/reservoirprotocol/indexer/compare/v5.66.2...v5.66.3) (2022-05-16)


### Bug Fixes

* expose external orderbook error messages ([ceb8c30](https://github.com/reservoirprotocol/indexer/commit/ceb8c30a12682f07166be904c8cd592ae3bbb452))



## [5.66.2](https://github.com/reservoirprotocol/indexer/compare/v5.66.1...v5.66.2) (2022-05-13)



## [5.66.1](https://github.com/reservoirprotocol/indexer/compare/v5.66.0...v5.66.1) (2022-05-13)


### Features

* implement owners distribution api v1 ([c106928](https://github.com/reservoirprotocol/indexer/commit/c106928e4280e70f56b978ebc3dadaa80a4f484f))



# [5.66.0](https://github.com/reservoirprotocol/indexer/compare/v5.65.6...v5.66.0) (2022-05-13)


### Features

* added floorSaleChange to collections API ([abb28db](https://github.com/reservoirprotocol/indexer/commit/abb28dbe5dbc9b555d54804b6d35db06e42de214))



## [5.65.6](https://github.com/reservoirprotocol/indexer/compare/v5.65.5...v5.65.6) (2022-05-13)


### Bug Fixes

* skip precheck filling when using foundation ([ea0d049](https://github.com/reservoirprotocol/indexer/commit/ea0d04966655e9a131880dfeff0696daf6fb1f27))



## [5.65.5](https://github.com/reservoirprotocol/indexer/compare/v5.65.4...v5.65.5) (2022-05-13)



## [5.65.4](https://github.com/reservoirprotocol/indexer/compare/v5.65.3...v5.65.4) (2022-05-13)



## [5.65.3](https://github.com/reservoirprotocol/indexer/compare/v5.65.2...v5.65.3) (2022-05-13)


### Bug Fixes

* debug missing foundation orders ([02b7c8d](https://github.com/reservoirprotocol/indexer/commit/02b7c8d94087eaba85fadc93997e6b53c4f125de))



## [5.65.2](https://github.com/reservoirprotocol/indexer/compare/v5.65.1...v5.65.2) (2022-05-13)


### Bug Fixes

* debug missing foundation orders ([d2cf3be](https://github.com/reservoirprotocol/indexer/commit/d2cf3be18e0ce1cf9fccab6214bf555724df9d33))



## [5.65.1](https://github.com/reservoirprotocol/indexer/compare/v5.65.0...v5.65.1) (2022-05-13)


### Features

* update /execute/buy apis ([520ce29](https://github.com/reservoirprotocol/indexer/commit/520ce29d2f5784564338bb3af95278c1b5cd5776))



# [5.65.0](https://github.com/reservoirprotocol/indexer/compare/v5.64.9...v5.65.0) (2022-05-12)


### Features

* update attributes/all ([2c15288](https://github.com/reservoirprotocol/indexer/commit/2c15288b87ad9413bb746c9b45f2cc75e75751b8))



## [5.64.9](https://github.com/reservoirprotocol/indexer/compare/v5.64.8...v5.64.9) (2022-05-12)


### Bug Fixes

* stats api top bid retrieval ([41f1106](https://github.com/reservoirprotocol/indexer/commit/41f110651121b322c57a8b2b960623cd68a0011d))



## [5.64.8](https://github.com/reservoirprotocol/indexer/compare/v5.64.7...v5.64.8) (2022-05-12)


### Features

* update attributes/all ([7acda1e](https://github.com/reservoirprotocol/indexer/commit/7acda1e3dc4a913ba5347f6f96eb50b39e797bb0))



## [5.64.7](https://github.com/reservoirprotocol/indexer/compare/v5.64.6...v5.64.7) (2022-05-12)


### Features

* add script for checking the /execute/buy apis ([5b0d27e](https://github.com/reservoirprotocol/indexer/commit/5b0d27e1202605e5ae2a49a31173b9c073d1356b))



## [5.64.6](https://github.com/reservoirprotocol/indexer/compare/v5.64.5...v5.64.6) (2022-05-12)


### Bug Fixes

* properly fill bids ([b1ee398](https://github.com/reservoirprotocol/indexer/commit/b1ee39875abcb6c8a70bf8e86b52d8f1d320e5fa))
* refacor and fix /execute/sell/v2 api ([283e3f3](https://github.com/reservoirprotocol/indexer/commit/283e3f3ed5511ceecca1e0cc0115f7cf0639816c))
* tweak query to use index ([12781ea](https://github.com/reservoirprotocol/indexer/commit/12781ea06e52484891c627d43d302669f5487931))
* tweaks ([6d5123d](https://github.com/reservoirprotocol/indexer/commit/6d5123d540d9fb07c7d3716386daa7d4e96e4bff))
* tweaks ([f48507b](https://github.com/reservoirprotocol/indexer/commit/f48507ba0f237b0dc9944f4702c69c68131058a8))
* tweaks ([77c8844](https://github.com/reservoirprotocol/indexer/commit/77c88442a015dfdce91ad635dfd21395e5f4b047))
* tweaks ([27c3e53](https://github.com/reservoirprotocol/indexer/commit/27c3e53bc3d1d1db90dfee3f0b479c77e8267fea))


### Features

* allow skipping balance checks on the /execute/buy APIs ([a02088d](https://github.com/reservoirprotocol/indexer/commit/a02088da2d99f0e6800f421013f8f60b4eabe3ef))
* integrate multi buy in the execute apis ([8f87016](https://github.com/reservoirprotocol/indexer/commit/8f87016b858a36a7f0fbafd074a684b7941ca7c9))
* return validFrom in the token floor ask events api ([e8b3611](https://github.com/reservoirprotocol/indexer/commit/e8b3611eece9be291540438120e3770babc9e6a0))
* wip ([ae17f6d](https://github.com/reservoirprotocol/indexer/commit/ae17f6d66ef21e100eed2bb457f70a547f59faf9))



## [5.64.5](https://github.com/reservoirprotocol/indexer/compare/v5.64.4...v5.64.5) (2022-05-11)


### Features

* remove logs ([09c4078](https://github.com/reservoirprotocol/indexer/commit/09c4078fddb34625762fa92b39909f794aac759b))
* update attribute keys of type number ([8c1b956](https://github.com/reservoirprotocol/indexer/commit/8c1b956cc891a04345735e8cfb8e84424e0a3763))
* update docker compose to use specific versions ([07b37bd](https://github.com/reservoirprotocol/indexer/commit/07b37bdb16f3b5dc31229679bcfe3f50b2ed517a))
* update migration ([cccf2f5](https://github.com/reservoirprotocol/indexer/commit/cccf2f59ad7ddd0b2f57da9cb24aa95d1cb3f223))
* update query ([c3f3f03](https://github.com/reservoirprotocol/indexer/commit/c3f3f03daf8e4998e60f176e7cb62959c94ddd53))
* update query ([c66ea3a](https://github.com/reservoirprotocol/indexer/commit/c66ea3a8df41b850b61a11394f59735de3164557))
* update query ([8894094](https://github.com/reservoirprotocol/indexer/commit/88940941af4a69c231d74a4a660b2c75cdd7ac2a))
* wip ([97c0ca5](https://github.com/reservoirprotocol/indexer/commit/97c0ca5202483251fa82471d51c749b61d186687))



## [5.64.4](https://github.com/reservoirprotocol/indexer/compare/v5.64.3...v5.64.4) (2022-05-11)



## [5.64.3](https://github.com/reservoirprotocol/indexer/compare/v5.64.2...v5.64.3) (2022-05-11)



## [5.64.2](https://github.com/reservoirprotocol/indexer/compare/v5.64.1...v5.64.2) (2022-05-11)



## [5.64.1](https://github.com/reservoirprotocol/indexer/compare/v5.64.0...v5.64.1) (2022-05-11)



# [5.64.0](https://github.com/reservoirprotocol/indexer/compare/v5.63.0...v5.64.0) (2022-05-11)


### Features

* wip ([6839e0a](https://github.com/reservoirprotocol/indexer/commit/6839e0a4e50cd36d47bdb05697fb4df891130fe6))



# [5.63.0](https://github.com/reservoirprotocol/indexer/compare/v5.62.1...v5.63.0) (2022-05-11)


### Features

* added attributes to collection/v2 ([61f651d](https://github.com/reservoirprotocol/indexer/commit/61f651d25ccc0ec8a1adfb5360dbf30844b4ebf5))



## [5.62.1](https://github.com/reservoirprotocol/indexer/compare/v5.62.0...v5.62.1) (2022-05-10)


### Bug Fixes

* buggy rinkeby wyvern v2.3 nonces ([c772cd3](https://github.com/reservoirprotocol/indexer/commit/c772cd35264d66d276135c8a29ad4c6aae4136eb))
* tweaks ([cca94c9](https://github.com/reservoirprotocol/indexer/commit/cca94c96922be51e5b3d6bb3866074b53ff09b94))



# [5.62.0](https://github.com/reservoirprotocol/indexer/compare/v5.61.0...v5.62.0) (2022-05-10)


### Features

* update docker compose to use specific versions ([7852274](https://github.com/reservoirprotocol/indexer/commit/7852274efc88a71afcb27f6836d71d5287950fd0))



# [5.61.0](https://github.com/reservoirprotocol/indexer/compare/v5.60.0...v5.61.0) (2022-05-10)


### Features

* reduce arweave relay bulk limit ([32888df](https://github.com/reservoirprotocol/indexer/commit/32888dfc5a978a007de7049aa764a337a5d5882e))



# [5.60.0](https://github.com/reservoirprotocol/indexer/compare/v5.59.17...v5.60.0) (2022-05-10)


### Features

* added allowExitOnIdle ([7eba026](https://github.com/reservoirprotocol/indexer/commit/7eba0263a048e43e711278de3b26e3c04a34c13e))



## [5.59.17](https://github.com/reservoirprotocol/indexer/compare/v5.59.16...v5.59.17) (2022-05-10)


### Features

* close db connections on exit ([da719d3](https://github.com/reservoirprotocol/indexer/commit/da719d33207c948f815130b931631dcd581bd821))



## [5.59.16](https://github.com/reservoirprotocol/indexer/compare/v5.59.15...v5.59.16) (2022-05-10)


### Bug Fixes

* native filling for foundation orders ([97fe75b](https://github.com/reservoirprotocol/indexer/commit/97fe75b88d8c903076996d5eb38ee11e4d738aee))



## [5.59.15](https://github.com/reservoirprotocol/indexer/compare/v5.59.14...v5.59.15) (2022-05-10)


### Bug Fixes

* more efficient query for order fixes by token ([baa76d8](https://github.com/reservoirprotocol/indexer/commit/baa76d8f2513acea6881122b42d43fbec59cf4ca))
* reduce expired orders query batch size ([be6da46](https://github.com/reservoirprotocol/indexer/commit/be6da46197aebff1e7329e427a950c7c10b03426))


### Features

* add support for foundation in the execute apis ([503440d](https://github.com/reservoirprotocol/indexer/commit/503440dcbbff00801947f94cdab980cc84b925a0))



## [5.59.14](https://github.com/reservoirprotocol/indexer/compare/v5.59.13...v5.59.14) (2022-05-10)


### Bug Fixes

* wrong foundation cancel events query ([85f8250](https://github.com/reservoirprotocol/indexer/commit/85f82500555cd4682df6053759279e534e03b676))



## [5.59.13](https://github.com/reservoirprotocol/indexer/compare/v5.59.12...v5.59.13) (2022-05-10)


### Bug Fixes

* custom handling of foundation orders cancels ([b0f301a](https://github.com/reservoirprotocol/indexer/commit/b0f301a871dd8dfb84d40dfff330ab22051fae73))


### Features

* expose nonce in the tokens floor ask events api ([4ad89d9](https://github.com/reservoirprotocol/indexer/commit/4ad89d98cf975644d1201576abcbbbd59ee7970c))



## [5.59.12](https://github.com/reservoirprotocol/indexer/compare/v5.59.11...v5.59.12) (2022-05-09)


### Bug Fixes

* ensure no cancelled or filled foundation orders can go through ([894142d](https://github.com/reservoirprotocol/indexer/commit/894142d615c09142b465a160e8d0eba8f7db61f6))



## [5.59.11](https://github.com/reservoirprotocol/indexer/compare/v5.59.10...v5.59.11) (2022-05-09)


### Bug Fixes

* ignore balance validation when using foundation ([f3327d0](https://github.com/reservoirprotocol/indexer/commit/f3327d05b43ca7f5d2890ed140747ad0dfc40853))
* single collection api wrong owner count ([89f7e41](https://github.com/reservoirprotocol/indexer/commit/89f7e410f9abf9b52da27e254613b493c3f91272))



## [5.59.10](https://github.com/reservoirprotocol/indexer/compare/v5.59.9...v5.59.10) (2022-05-09)



## [5.59.9](https://github.com/reservoirprotocol/indexer/compare/v5.59.8...v5.59.9) (2022-05-09)


### Features

* add support for handling foundation buy now orders ([0c8b1ca](https://github.com/reservoirprotocol/indexer/commit/0c8b1ca4dc1de938b3e220659ec249672b2ff019))



## [5.59.8](https://github.com/reservoirprotocol/indexer/compare/v5.59.7...v5.59.8) (2022-05-09)


### Bug Fixes

* tokens boostrap continuation handling ([f9e06a3](https://github.com/reservoirprotocol/indexer/commit/f9e06a3b00dfc026dd01ac80edc471801209dfe7))



## [5.59.7](https://github.com/reservoirprotocol/indexer/compare/v5.59.6...v5.59.7) (2022-05-06)


### Features

* added id to sales/v3 api ([2bdcc66](https://github.com/reservoirprotocol/indexer/commit/2bdcc66452b5b314bb944f4aa6fdec461ac13e13))



## [5.59.6](https://github.com/reservoirprotocol/indexer/compare/v5.59.5...v5.59.6) (2022-05-06)


### Features

* add support for zeroex-v4/opendao collection offers ([11e1478](https://github.com/reservoirprotocol/indexer/commit/11e1478de0ae6c5a983c319ed86991b6700486d1))



## [5.59.5](https://github.com/reservoirprotocol/indexer/compare/v5.59.4...v5.59.5) (2022-05-06)


### Features

* update search api ([a769029](https://github.com/reservoirprotocol/indexer/commit/a769029ba47476eebc5e86a3f490bb7e17951fb7))



## [5.59.4](https://github.com/reservoirprotocol/indexer/compare/v5.59.3...v5.59.4) (2022-05-06)


### Features

* added new collection v2 api ([c460b00](https://github.com/reservoirprotocol/indexer/commit/c460b007426c07cb07104d4d942a145ac8192cf4))



## [5.59.3](https://github.com/reservoirprotocol/indexer/compare/v5.59.2...v5.59.3) (2022-05-06)


### Bug Fixes

* optimize ar tokens usage ([900e439](https://github.com/reservoirprotocol/indexer/commit/900e439fa1daa4260e8fafa263d7775a7c59c7ce))



## [5.59.2](https://github.com/reservoirprotocol/indexer/compare/v5.59.1...v5.59.2) (2022-05-06)


### Bug Fixes

* multi buy via zeroex-v4 ([676b28c](https://github.com/reservoirprotocol/indexer/commit/676b28cbc20892e852b23fe92ca598b27ac3cd0e))



## [5.59.1](https://github.com/reservoirprotocol/indexer/compare/v5.59.0...v5.59.1) (2022-05-06)


### Features

* update search api ([f002d44](https://github.com/reservoirprotocol/indexer/commit/f002d44e8d887b5119aa488332528354593ce7d3))



# [5.59.0](https://github.com/reservoirprotocol/indexer/compare/v5.58.0...v5.59.0) (2022-05-06)


### Features

* resync floor value ([590c0be](https://github.com/reservoirprotocol/indexer/commit/590c0be07af5e0acd67833c19bc7c4e4cababd22))



# [5.58.0](https://github.com/reservoirprotocol/indexer/compare/v5.57.0...v5.58.0) (2022-05-06)


### Features

* resync floor value ([5d236d3](https://github.com/reservoirprotocol/indexer/commit/5d236d35bfa6f78235e673a0e8c9efb471712bba))



# [5.57.0](https://github.com/reservoirprotocol/indexer/compare/v5.56.0...v5.57.0) (2022-05-05)


### Features

* case prices to number ([6f5bcc9](https://github.com/reservoirprotocol/indexer/commit/6f5bcc935eee945e66393349425cebdaffcd5301))



# [5.56.0](https://github.com/reservoirprotocol/indexer/compare/v5.55.2...v5.56.0) (2022-05-05)


### Features

* update log ([3f08ce7](https://github.com/reservoirprotocol/indexer/commit/3f08ce72aee3121823b2893a07cb0e82caecbe87))



## [5.55.2](https://github.com/reservoirprotocol/indexer/compare/v5.55.1...v5.55.2) (2022-05-05)


### Features

* added cache on search ([63b8a4d](https://github.com/reservoirprotocol/indexer/commit/63b8a4dc065a11dd93ebcd071f3505c5717912ca))
* added new api to search for collections by name ([bd10c5a](https://github.com/reservoirprotocol/indexer/commit/bd10c5a2a1ffc42e8463c914d2af4343849b9c29))



## [5.55.1](https://github.com/reservoirprotocol/indexer/compare/v5.55.0...v5.55.1) (2022-05-05)


### Features

* support multiple fee recipients (if exchange allows it) ([4cb3df2](https://github.com/reservoirprotocol/indexer/commit/4cb3df2320a5c30f025677d1c65013fc0e7629c9))



# [5.55.0](https://github.com/reservoirprotocol/indexer/compare/v5.54.2...v5.55.0) (2022-05-05)


### Features

* update token refresh ([35a85aa](https://github.com/reservoirprotocol/indexer/commit/35a85aa01aff14b7eb21d11131177aa99bf21a3a))



## [5.54.2](https://github.com/reservoirprotocol/indexer/compare/v5.54.1...v5.54.2) (2022-05-05)


### Features

* update log ([83bb37e](https://github.com/reservoirprotocol/indexer/commit/83bb37edaf24ca56034f22ca8150084b414cfe23))



## [5.54.1](https://github.com/reservoirprotocol/indexer/compare/v5.54.0...v5.54.1) (2022-05-05)


### Features

* update bull board ([c93cbb8](https://github.com/reservoirprotocol/indexer/commit/c93cbb830196edd0036463c0937412024b372534))



# [5.54.0](https://github.com/reservoirprotocol/indexer/compare/v5.53.5...v5.54.0) (2022-05-05)


### Features

* fix explore API ([afdbeb1](https://github.com/reservoirprotocol/indexer/commit/afdbeb17709054a52f08ec891853340cb0f8d887))



## [5.53.5](https://github.com/reservoirprotocol/indexer/compare/v5.53.4...v5.53.5) (2022-05-05)


### Features

* improve multi buy ([d9c4cc3](https://github.com/reservoirprotocol/indexer/commit/d9c4cc3776b65d2a54fad90069e9ec3c7fcdf44d))



## [5.53.4](https://github.com/reservoirprotocol/indexer/compare/v5.53.3...v5.53.4) (2022-05-05)


### Features

* add support for cross-posting to looksrare ([8707851](https://github.com/reservoirprotocol/indexer/commit/87078514cd3c369f964c13ca4bef67012178d089))
* wip ([6c8c649](https://github.com/reservoirprotocol/indexer/commit/6c8c649ad02137d380eb2ef4d9de0ed37066414a))



## [5.53.3](https://github.com/reservoirprotocol/indexer/compare/v5.53.2...v5.53.3) (2022-05-05)


### Features

* tweak /execute/buy/v1 and /execute/sell/v1 apis to use the router ([c35a84f](https://github.com/reservoirprotocol/indexer/commit/c35a84f19258ac5b30a2a56bdcf17b37fa54c6f9))



## [5.53.2](https://github.com/reservoirprotocol/indexer/compare/v5.53.1...v5.53.2) (2022-05-05)


### Features

* cache on collection floor ([a7d1e6e](https://github.com/reservoirprotocol/indexer/commit/a7d1e6e318ed9b67cd49608a978ff0ce8721b424))



## [5.53.1](https://github.com/reservoirprotocol/indexer/compare/v5.53.0...v5.53.1) (2022-05-05)


### Features

* cache on collection floor ([a87d4cf](https://github.com/reservoirprotocol/indexer/commit/a87d4cfa2aa9d755105cff5e7e880b6cc2892981))



# [5.53.0](https://github.com/reservoirprotocol/indexer/compare/v5.52.3...v5.53.0) (2022-05-05)


### Features

* cache on collection floor ([64af598](https://github.com/reservoirprotocol/indexer/commit/64af598ad1ab4bb0a6bb8982493eeecafd73ae9d))



## [5.52.3](https://github.com/reservoirprotocol/indexer/compare/v5.52.2...v5.52.3) (2022-05-05)


### Features

* resume queue ([35bbaa2](https://github.com/reservoirprotocol/indexer/commit/35bbaa27cb2cafbfa000baa684fc4d51a96929a9))



## [5.52.2](https://github.com/reservoirprotocol/indexer/compare/v5.52.1...v5.52.2) (2022-05-05)


### Features

* resume queue ([5e425ad](https://github.com/reservoirprotocol/indexer/commit/5e425ad9865481f4457e38c7b809c2dcaa624632))



## [5.52.1](https://github.com/reservoirprotocol/indexer/compare/v5.52.0...v5.52.1) (2022-05-04)


### Features

* resume queue ([c47b7f1](https://github.com/reservoirprotocol/indexer/commit/c47b7f1d6d1b2b54890cd3ca976a1d8b34f1cf39))



# [5.52.0](https://github.com/reservoirprotocol/indexer/compare/v5.51.0...v5.52.0) (2022-05-04)


### Features

* resume queue ([84aebef](https://github.com/reservoirprotocol/indexer/commit/84aebef6487d81ee291471e99854ea744c48c638))



# [5.51.0](https://github.com/reservoirprotocol/indexer/compare/v5.50.1...v5.51.0) (2022-05-04)


### Features

* stop queue ([440440a](https://github.com/reservoirprotocol/indexer/commit/440440a64100a7c3bbbce81f6a72704f71622746))



## [5.50.1](https://github.com/reservoirprotocol/indexer/compare/v5.50.0...v5.50.1) (2022-05-04)


### Features

* wip ([eaeb1be](https://github.com/reservoirprotocol/indexer/commit/eaeb1be6dd0c314e60deb2b8cb55a09c40d453f3))



# [5.50.0](https://github.com/reservoirprotocol/indexer/compare/v5.49.0...v5.50.0) (2022-05-04)


### Features

* wip ([d75b63b](https://github.com/reservoirprotocol/indexer/commit/d75b63b2859623d8c2673c577aa92bf790fb7c8f))



# [5.49.0](https://github.com/reservoirprotocol/indexer/compare/v5.48.8...v5.49.0) (2022-05-04)


### Features

* wip ([b9e6e26](https://github.com/reservoirprotocol/indexer/commit/b9e6e2614ac6b05675343d9da2e6de1b45e597a4))



## [5.48.8](https://github.com/reservoirprotocol/indexer/compare/v5.48.7...v5.48.8) (2022-05-04)


### Features

* update token details response ([369f17a](https://github.com/reservoirprotocol/indexer/commit/369f17a730a82cfc4e0067c2719dc5465a8c5f32))



## [5.48.7](https://github.com/reservoirprotocol/indexer/compare/v5.48.6...v5.48.7) (2022-05-04)


### Features

* add admin api to invalidate an order ([3efffc3](https://github.com/reservoirprotocol/indexer/commit/3efffc3a70101871aee9003a11bcc9f3f9bdd891))



## [5.48.6](https://github.com/reservoirprotocol/indexer/compare/v5.48.5...v5.48.6) (2022-05-04)


### Bug Fixes

* filling bids through the router ([884f803](https://github.com/reservoirprotocol/indexer/commit/884f803cd7aab554fb024a161ed59ed334d3e01b))



## [5.48.5](https://github.com/reservoirprotocol/indexer/compare/v5.48.4...v5.48.5) (2022-05-04)


### Features

* wip ([f148312](https://github.com/reservoirprotocol/indexer/commit/f148312356f7da7615825d867decdbfea1822d75))



## [5.48.4](https://github.com/reservoirprotocol/indexer/compare/v5.48.3...v5.48.4) (2022-05-04)


### Features

* wip ([74e4a40](https://github.com/reservoirprotocol/indexer/commit/74e4a403c116f93c1bbcfbdf11c68746e79d0cd2))



## [5.48.3](https://github.com/reservoirprotocol/indexer/compare/v5.48.2...v5.48.3) (2022-05-04)


### Features

* wip ([cb4d919](https://github.com/reservoirprotocol/indexer/commit/cb4d9199974fb2afb4a6a5626120e0bfdae56f80))
* wip ([0666cd8](https://github.com/reservoirprotocol/indexer/commit/0666cd85573699ffbce81cace4e1da41f3e08b39))



## [5.48.2](https://github.com/reservoirprotocol/indexer/compare/v5.48.1...v5.48.2) (2022-05-04)


### Features

* update key ([5a2f4d6](https://github.com/reservoirprotocol/indexer/commit/5a2f4d6650db7ca13cbed1715c424353470b07bc))



## [5.48.1](https://github.com/reservoirprotocol/indexer/compare/v5.48.0...v5.48.1) (2022-05-04)


### Bug Fixes

* looksrare execute buy ([27549af](https://github.com/reservoirprotocol/indexer/commit/27549af8d97f4786b106165ee78812663d4cfc37))



# [5.48.0](https://github.com/reservoirprotocol/indexer/compare/v5.47.9...v5.48.0) (2022-05-04)


### Features

* wip ([f810e9c](https://github.com/reservoirprotocol/indexer/commit/f810e9cfdadeb91ba0748be5c0e9bc35a73a2c8f))



## [5.47.9](https://github.com/reservoirprotocol/indexer/compare/v5.47.8...v5.47.9) (2022-05-04)


### Features

* added backfill script for the attributes ([33aea12](https://github.com/reservoirprotocol/indexer/commit/33aea1261470cb07e595c330efd99b2debc431db))
* added backfill script for the attributes ([a3b86f3](https://github.com/reservoirprotocol/indexer/commit/a3b86f31bd89293223c6f723b1a529342ddb9ae5))
* added backfill script for the attributes ([cc99be8](https://github.com/reservoirprotocol/indexer/commit/cc99be837c6a3ee2f618e4609a68cedfa84c6d8d))
* store collection id and kind on the attributes table ([1d1bf6c](https://github.com/reservoirprotocol/indexer/commit/1d1bf6cad0a74cae183ae621faf9510d3f0476f2))
* store collection id and kind on the attributes table ([e0fe5fb](https://github.com/reservoirprotocol/indexer/commit/e0fe5fbf57475e8cb15c839a2b64741a85a9853d))
* updated lock name ([713653d](https://github.com/reservoirprotocol/indexer/commit/713653d87cb38d7f9f340424e004976b88b4746c))



## [5.47.8](https://github.com/reservoirprotocol/indexer/compare/v5.47.7...v5.47.8) (2022-05-04)



## [5.47.7](https://github.com/reservoirprotocol/indexer/compare/v5.47.6...v5.47.7) (2022-05-04)


### Bug Fixes

* properly handle zeroex/opendao fees ([351b016](https://github.com/reservoirprotocol/indexer/commit/351b0166897e33fc29b92057b4e51aa281bda412))



## [5.47.6](https://github.com/reservoirprotocol/indexer/compare/v5.47.5...v5.47.6) (2022-05-04)


### Bug Fixes

* handle real-time orders with priority ([eda09ea](https://github.com/reservoirprotocol/indexer/commit/eda09ea7649804d1cda24bd538640070c4525f77))



## [5.47.5](https://github.com/reservoirprotocol/indexer/compare/v5.47.4...v5.47.5) (2022-05-04)


### Bug Fixes

* properly nullify validFrom ([13f84fb](https://github.com/reservoirprotocol/indexer/commit/13f84fbb1caf9282a2eec99c5494b7abefb104ab))



## [5.47.4](https://github.com/reservoirprotocol/indexer/compare/v5.47.3...v5.47.4) (2022-05-04)


### Features

* log the size of the orders queue on a cron job ([f697729](https://github.com/reservoirprotocol/indexer/commit/f6977299f6aca78434af709053aaaa94a74ed702))



## [5.47.3](https://github.com/reservoirprotocol/indexer/compare/v5.47.2...v5.47.3) (2022-05-04)


### Bug Fixes

* disable contract orders revalidation ([41ad03d](https://github.com/reservoirprotocol/indexer/commit/41ad03d99200bca22a47aaddd1eb7e4252d9534f))



## [5.47.2](https://github.com/reservoirprotocol/indexer/compare/v5.47.1...v5.47.2) (2022-05-04)


### Features

* added concurrency to handle new sell orders ([f0aebea](https://github.com/reservoirprotocol/indexer/commit/f0aebea2c1593e92cf6ea7feaee2b423769c746e))



## [5.47.1](https://github.com/reservoirprotocol/indexer/compare/v5.47.0...v5.47.1) (2022-05-04)


### Features

* added concurrency to write queue ([828558d](https://github.com/reservoirprotocol/indexer/commit/828558d6ec5b1e9ba709a961143f79ee18ee5344))



# [5.47.0](https://github.com/reservoirprotocol/indexer/compare/v5.46.2...v5.47.0) (2022-05-04)


### Features

* added attribute/all v2 ([86cea81](https://github.com/reservoirprotocol/indexer/commit/86cea81cf5c3983eb30bbac15e310fee49e58723))



## [5.46.2](https://github.com/reservoirprotocol/indexer/compare/v5.46.1...v5.46.2) (2022-05-03)


### Bug Fixes

* properly fill bids ([d9a772f](https://github.com/reservoirprotocol/indexer/commit/d9a772f80fced38d0a03aaf4cd18f60447513e09))
* refacor and fix /execute/sell/v2 api ([0786464](https://github.com/reservoirprotocol/indexer/commit/078646480d0fa349e0ffc19d183c1fcd67d36115))
* tweak query to use index ([0d527dc](https://github.com/reservoirprotocol/indexer/commit/0d527dccdf4e613cc3a70700e1430b07a1fcf1b0))
* tweaks ([af075e4](https://github.com/reservoirprotocol/indexer/commit/af075e4a0b222daf333b6477dce9113243f37c6f))
* tweaks ([26f3791](https://github.com/reservoirprotocol/indexer/commit/26f3791a9237d4b55ea986b3129f4e6cfc458aff))
* tweaks ([b82bf40](https://github.com/reservoirprotocol/indexer/commit/b82bf40d0cce1fdf5f47f386dcae7e0f8fb8739c))


### Features

* integrate multi buy in the execute apis ([22c0378](https://github.com/reservoirprotocol/indexer/commit/22c0378e1864188b0b69afb4e2a46697a3dfdc3e))



## [5.46.1](https://github.com/reservoirprotocol/indexer/compare/v5.46.0...v5.46.1) (2022-05-03)


### Features

* longer cool down for big collections ([d436cd6](https://github.com/reservoirprotocol/indexer/commit/d436cd6c4b858f977c7eedb4d58010ffd241d1e2))
* longer cool down for big collections ([01a8e94](https://github.com/reservoirprotocol/indexer/commit/01a8e9440bbf841e274226c4d8d432a2a8153d33))
* resume source resync ([629e79b](https://github.com/reservoirprotocol/indexer/commit/629e79b9e647c717db8868115b66ad3efb94fd02))
* revalidate orders on token/collection refresh ([b18a449](https://github.com/reservoirprotocol/indexer/commit/b18a449d4e2d3b7f59122ec858282cc79c304f4b))
* update collection tokens count ([dd12802](https://github.com/reservoirprotocol/indexer/commit/dd12802171b76ca4785d764e4f4d276f4b4cd07a))
* wip ([4365ae8](https://github.com/reservoirprotocol/indexer/commit/4365ae8d547ab5922d7645e0ffe449f74f2fea12))



# [5.46.0](https://github.com/reservoirprotocol/indexer/compare/v5.45.2...v5.46.0) (2022-05-03)


### Features

* resume source resync ([a59c3e8](https://github.com/reservoirprotocol/indexer/commit/a59c3e83c1c65c133eb65248ce1ae41597acb4da))



## [5.45.2](https://github.com/reservoirprotocol/indexer/compare/v5.45.1...v5.45.2) (2022-05-03)


### Features

* delete empty attributes ([3afcb38](https://github.com/reservoirprotocol/indexer/commit/3afcb38aa3e4ce330044da5f8dd5258f15a9b265))



## [5.45.1](https://github.com/reservoirprotocol/indexer/compare/v5.45.0...v5.45.1) (2022-05-03)


### Features

* update the backfill queues ([c382a41](https://github.com/reservoirprotocol/indexer/commit/c382a412f129aa34ea15abedc105ae1a626eff31))



# [5.45.0](https://github.com/reservoirprotocol/indexer/compare/v5.44.0...v5.45.0) (2022-05-03)


### Features

* update the backfill queues ([a202da3](https://github.com/reservoirprotocol/indexer/commit/a202da3bb3bcb9b259bb7defdda5b715e61166fe))



# [5.44.0](https://github.com/reservoirprotocol/indexer/compare/v5.43.8...v5.44.0) (2022-05-03)


### Features

* update the backfill queues ([f8ce277](https://github.com/reservoirprotocol/indexer/commit/f8ce277e6b2894d57a6db0c7eb043abc672c910f))



## [5.43.8](https://github.com/reservoirprotocol/indexer/compare/v5.43.7...v5.43.8) (2022-05-03)


### Features

* resync token attribute counts ([1fe212a](https://github.com/reservoirprotocol/indexer/commit/1fe212acb24401282f20a368724bb8cf38cbd0cd))



## [5.43.7](https://github.com/reservoirprotocol/indexer/compare/v5.43.6...v5.43.7) (2022-05-03)


### Bug Fixes

* reduce arweave relay interval ([841bc52](https://github.com/reservoirprotocol/indexer/commit/841bc528ddc25b74d2694a89edb3892db560fcc8))



## [5.43.6](https://github.com/reservoirprotocol/indexer/compare/v5.43.5...v5.43.6) (2022-05-03)


### Bug Fixes

* correction for filling bids ([b989d81](https://github.com/reservoirprotocol/indexer/commit/b989d8117c3f4b116344266b635e95e99e7eb08b))
* incorrect 0x v4 listings ([cd2aa08](https://github.com/reservoirprotocol/indexer/commit/cd2aa08fd7cffe40e4ba4a6ebbb0c235149dc7ce))



## [5.43.5](https://github.com/reservoirprotocol/indexer/compare/v5.43.4...v5.43.5) (2022-05-03)


### Features

* return validFrom in the token floor ask events api ([bb3dc7b](https://github.com/reservoirprotocol/indexer/commit/bb3dc7bf76285db9d2b895792a6849275d11b131))



## [5.43.4](https://github.com/reservoirprotocol/indexer/compare/v5.43.3...v5.43.4) (2022-05-03)


### Bug Fixes

* debug failing router transactions ([7a383fe](https://github.com/reservoirprotocol/indexer/commit/7a383fe525457b403f8631e27c65743fd287ce3c))
* debug failing router transactions ([31d8707](https://github.com/reservoirprotocol/indexer/commit/31d8707327db89526b78d539925107bd51fd3cba))
* minor tweaks ([f1604c5](https://github.com/reservoirprotocol/indexer/commit/f1604c537a63cfb4209ec07209e1f5477895aebf))
* minor tweaks ([646ba3d](https://github.com/reservoirprotocol/indexer/commit/646ba3dadb74df1c6fe2b17d9f69c91011e62689))
* missing return ([03ee14f](https://github.com/reservoirprotocol/indexer/commit/03ee14f83194f33b711d5885ce28b5ece9a7f145))
* properly fill bids ([8c1c391](https://github.com/reservoirprotocol/indexer/commit/8c1c3910c065c626939977fc0dcb9b6e3446e990))
* skip reduntant token collection update ([4cf93fb](https://github.com/reservoirprotocol/indexer/commit/4cf93fb8938a2a3a537b5ee4f84eaa66f79599e0))


### Features

* integrate router in the execute buy api ([c98fe11](https://github.com/reservoirprotocol/indexer/commit/c98fe1102968ca3dff3a4c00df000b9db23c0e16))
* integrate router in the execute sell api ([ffd583d](https://github.com/reservoirprotocol/indexer/commit/ffd583d8bc207dc2fd67ada3cdfb484d4f7b7114))



## [5.43.3](https://github.com/reservoirprotocol/indexer/compare/v5.43.2...v5.43.3) (2022-05-03)


### Bug Fixes

* minor tweaks ([e604183](https://github.com/reservoirprotocol/indexer/commit/e6041835bfed608ac6e90c32d58b3a38bdd6b5b3))



## [5.43.2](https://github.com/reservoirprotocol/indexer/compare/v5.43.1...v5.43.2) (2022-05-02)


### Features

* added api to fix specific token cache ([f388089](https://github.com/reservoirprotocol/indexer/commit/f3880893eba70a40aab0682cfecbd07934619ae6))



## [5.43.1](https://github.com/reservoirprotocol/indexer/compare/v5.43.0...v5.43.1) (2022-05-02)


### Features

* use cached sample images ([ae660e0](https://github.com/reservoirprotocol/indexer/commit/ae660e02758c530adcd4538d90996dbece73c6cc))



# [5.43.0](https://github.com/reservoirprotocol/indexer/compare/v5.42.4...v5.43.0) (2022-05-01)


### Features

* stop backfill ([fd6615d](https://github.com/reservoirprotocol/indexer/commit/fd6615db0530baf1cb5f1446ff0718be68f2dba0))



## [5.42.4](https://github.com/reservoirprotocol/indexer/compare/v5.42.3...v5.42.4) (2022-05-01)



## [5.42.3](https://github.com/reservoirprotocol/indexer/compare/v5.42.2...v5.42.3) (2022-04-30)


### Features

* added redirect APIs ([4ed58e1](https://github.com/reservoirprotocol/indexer/commit/4ed58e13a0e977bd5e997ad6fb9c25bf847a15b8))



## [5.42.2](https://github.com/reservoirprotocol/indexer/compare/v5.42.1...v5.42.2) (2022-04-30)


### Features

* added collections v4 API ([171d055](https://github.com/reservoirprotocol/indexer/commit/171d055df03eba0d66f97b99b0a1b4c212c020ba))



## [5.42.1](https://github.com/reservoirprotocol/indexer/compare/v5.42.0...v5.42.1) (2022-04-29)


### Features

* fix backfill and add collection floor price to tokens API ([d3c0293](https://github.com/reservoirprotocol/indexer/commit/d3c0293aa42e0b6862cfb514854f0b22439770c0))



# [5.42.0](https://github.com/reservoirprotocol/indexer/compare/v5.41.3...v5.42.0) (2022-04-29)


### Features

* fix backfill ([498061e](https://github.com/reservoirprotocol/indexer/commit/498061e4cac711e49d3f2d42c00466813bd9df6a))



## [5.41.3](https://github.com/reservoirprotocol/indexer/compare/v5.41.2...v5.41.3) (2022-04-29)


### Features

* basic collection floor ask price oracle api ([8b9a106](https://github.com/reservoirprotocol/indexer/commit/8b9a106d33f30cee0a66d8cf4a03b3e3be11a2de))
* basic collection floor ask price oracle api ([dc878b8](https://github.com/reservoirprotocol/indexer/commit/dc878b844179045ccdaa826f70c5e9c3bc1eed96))



## [5.41.2](https://github.com/reservoirprotocol/indexer/compare/v5.41.1...v5.41.2) (2022-04-28)


### Features

* fix backfill ([14ed221](https://github.com/reservoirprotocol/indexer/commit/14ed2213076fa3c4577d36f86cc98111506c51ed))



## [5.41.1](https://github.com/reservoirprotocol/indexer/compare/v5.41.0...v5.41.1) (2022-04-28)


### Features

* fix v2 ([37ec7bf](https://github.com/reservoirprotocol/indexer/commit/37ec7bfae92054bd9331d04eb0b85876e4c7ea69))



# [5.41.0](https://github.com/reservoirprotocol/indexer/compare/v5.40.2...v5.41.0) (2022-04-28)


### Features

* update backfill ([eb2fb4b](https://github.com/reservoirprotocol/indexer/commit/eb2fb4b81385979329fc29a103e1a8ed78cd50a4))



## [5.40.2](https://github.com/reservoirprotocol/indexer/compare/v5.40.1...v5.40.2) (2022-04-28)


### Features

* script to backfill images ([1845caf](https://github.com/reservoirprotocol/indexer/commit/1845caf8eabddb5e4b50c2880615630bd40fe25e))
* script to backfill images ([db43b56](https://github.com/reservoirprotocol/indexer/commit/db43b564a3f665c4fb3ff0432a0a6da6c9a352e5))



## [5.40.1](https://github.com/reservoirprotocol/indexer/compare/v5.40.0...v5.40.1) (2022-04-28)


### Features

* add only unique images ([f10eff1](https://github.com/reservoirprotocol/indexer/commit/f10eff1efe18028c331bbbce629d245807e8b23d))
* keep updating the sample images ([0588ace](https://github.com/reservoirprotocol/indexer/commit/0588aceac525b3f2656d04ab31e9b6d0245ee0d7))
* store sample images ([46a5215](https://github.com/reservoirprotocol/indexer/commit/46a52151af229d50298fafd2a545824a704b1b5a))



# [5.40.0](https://github.com/reservoirprotocol/indexer/compare/v5.39.2...v5.40.0) (2022-04-28)


### Features

* optimize explore v2 query ([f4a96b5](https://github.com/reservoirprotocol/indexer/commit/f4a96b5601e293f47793b9e4ad31884f5008d980))



## [5.39.2](https://github.com/reservoirprotocol/indexer/compare/v5.39.1...v5.39.2) (2022-04-27)


### Features

* new explore v2 api ([45d0a5f](https://github.com/reservoirprotocol/indexer/commit/45d0a5f6882b61534c9c1981cf50a84ce22ab21a))
* new explore v2 api ([458eb43](https://github.com/reservoirprotocol/indexer/commit/458eb4359f1b4c316cc33f8d8b4fac7f0f6effe5))
* resync all collections floor values ([885041c](https://github.com/reservoirprotocol/indexer/commit/885041cc99b48bdf61a137b07aafb8f98aea631b))
* update limit ([d9e8e47](https://github.com/reservoirprotocol/indexer/commit/d9e8e4735873a9132ee37908233c00b273157b40))
* update migration ([c341692](https://github.com/reservoirprotocol/indexer/commit/c341692996e1b2f13fb99d8c1bd4e246421adb26))
* update queue name ([fe2b968](https://github.com/reservoirprotocol/indexer/commit/fe2b968d4e4f0686f3fc0886decfae456d3b5904))
* update token floor values ([0b669b5](https://github.com/reservoirprotocol/indexer/commit/0b669b55ff04b8b5c01344dfef4116ad88abfd8f))
* update token floor values ([f6cdadf](https://github.com/reservoirprotocol/indexer/commit/f6cdadf6195c6b8f9cec6a31c5fdd08e70776ca6))



## [5.39.1](https://github.com/reservoirprotocol/indexer/compare/v5.39.0...v5.39.1) (2022-04-27)


### Features

* add referrer query param to the execute buy/sell apis ([8361276](https://github.com/reservoirprotocol/indexer/commit/8361276761e81e62cb845d7eb6e4fc23e333e4b3))



# [5.39.0](https://github.com/reservoirprotocol/indexer/compare/v5.38.3...v5.39.0) (2022-04-27)


### Features

* sort user collection by all_time_volume ([222f8d9](https://github.com/reservoirprotocol/indexer/commit/222f8d92b36791590904f8c2ba1c9ee11b1babe8))



## [5.38.3](https://github.com/reservoirprotocol/indexer/compare/v5.38.2...v5.38.3) (2022-04-26)


### Features

* return price in by-id-queue ([788c93a](https://github.com/reservoirprotocol/indexer/commit/788c93afacc2f6fb2deba02ed7bdf2fe89c57fed))



## [5.38.2](https://github.com/reservoirprotocol/indexer/compare/v5.38.1...v5.38.2) (2022-04-26)


### Bug Fixes

* increase owners api max offset ([8c4f60d](https://github.com/reservoirprotocol/indexer/commit/8c4f60d5ff964696f95cbc0bfb02fa625165da59))



## [5.38.1](https://github.com/reservoirprotocol/indexer/compare/v5.38.0...v5.38.1) (2022-04-26)


### Bug Fixes

* increase owners api max offset ([903d67b](https://github.com/reservoirprotocol/indexer/commit/903d67b159a1848f8402e949c4f0d20c5252ee3a))



# [5.38.0](https://github.com/reservoirprotocol/indexer/compare/v5.37.0...v5.38.0) (2022-04-26)


### Features

* update user collections query ([67cae87](https://github.com/reservoirprotocol/indexer/commit/67cae87b25dd69f621563c36f83b8f123cefd0d8))



# [5.37.0](https://github.com/reservoirprotocol/indexer/compare/v5.36.3...v5.37.0) (2022-04-26)


### Features

* use collection update queue ([ab03442](https://github.com/reservoirprotocol/indexer/commit/ab03442e4bb9d9b48dc9096d4a9fb25afc148c4a))



## [5.36.3](https://github.com/reservoirprotocol/indexer/compare/v5.36.2...v5.36.3) (2022-04-26)


### Features

* use default source when missing ([f187945](https://github.com/reservoirprotocol/indexer/commit/f187945c9496a148edb8a30d5ac99128f3cf8815))



## [5.36.2](https://github.com/reservoirprotocol/indexer/compare/v5.36.1...v5.36.2) (2022-04-26)


### Features

* use default source when missing ([7ff6f7b](https://github.com/reservoirprotocol/indexer/commit/7ff6f7b42c8fc469090e8b2e2f8dec4468d33664))



## [5.36.1](https://github.com/reservoirprotocol/indexer/compare/v5.36.0...v5.36.1) (2022-04-25)


### Features

* return collection image url ([9f5da10](https://github.com/reservoirprotocol/indexer/commit/9f5da10bf8be65a17ccad4b71c84dfc74453c7f6))



# [5.36.0](https://github.com/reservoirprotocol/indexer/compare/v5.35.0...v5.36.0) (2022-04-25)


### Features

* update user collections API ([b548c1b](https://github.com/reservoirprotocol/indexer/commit/b548c1b25e03944bf646f920b22829810c5b577f))



# [5.35.0](https://github.com/reservoirprotocol/indexer/compare/v5.34.1...v5.35.0) (2022-04-25)


### Features

* update user collections API ([abd147f](https://github.com/reservoirprotocol/indexer/commit/abd147fb014625731795e74e9f99aa4cd7868d3c))



## [5.34.1](https://github.com/reservoirprotocol/indexer/compare/v5.34.0...v5.34.1) (2022-04-25)


### Features

* update user collections API ([4eb5c5b](https://github.com/reservoirprotocol/indexer/commit/4eb5c5b085856e8ef83504909baba723c8de4daf))



# [5.34.0](https://github.com/reservoirprotocol/indexer/compare/v5.33.0...v5.34.0) (2022-04-25)


### Features

* update user collections API ([b669f69](https://github.com/reservoirprotocol/indexer/commit/b669f6943948404d0257a7a9fbfb418de3c311c1))



# [5.33.0](https://github.com/reservoirprotocol/indexer/compare/v5.32.0...v5.33.0) (2022-04-25)


### Features

* update metadata timeing update ([2b6da7d](https://github.com/reservoirprotocol/indexer/commit/2b6da7dd22ce92f47a06a20a7ea6e36c07284bb3))



# [5.32.0](https://github.com/reservoirprotocol/indexer/compare/v5.31.0...v5.32.0) (2022-04-25)


### Features

* update collection metadata ([5f13334](https://github.com/reservoirprotocol/indexer/commit/5f13334dca2de3d93887427fed3e3acf90da2e8c))



# [5.31.0](https://github.com/reservoirprotocol/indexer/compare/v5.30.35...v5.31.0) (2022-04-24)


### Features

* speed up source resync ([96eebae](https://github.com/reservoirprotocol/indexer/commit/96eebae3a1a1506a1db17c575d317c1954799ab4))



## [5.30.35](https://github.com/reservoirprotocol/indexer/compare/v5.30.34...v5.30.35) (2022-04-24)


### Bug Fixes

* properly fill looksrare orders ([947a2d2](https://github.com/reservoirprotocol/indexer/commit/947a2d2f901f57ea4e6bcf8ce0ec9c2eaedee645))



## [5.30.34](https://github.com/reservoirprotocol/indexer/compare/v5.30.33...v5.30.34) (2022-04-24)


### Bug Fixes

* minor tweaks ([5c7ddfd](https://github.com/reservoirprotocol/indexer/commit/5c7ddfd9cf4629458c491c2b9ae632c6673e628d))



## [5.30.33](https://github.com/reservoirprotocol/indexer/compare/v5.30.32...v5.30.33) (2022-04-24)


### Bug Fixes

* minor tweaks ([2c3575b](https://github.com/reservoirprotocol/indexer/commit/2c3575b92795774326c93c25c928122d2e666c2b))
* remove temporary script ([49dc6ba](https://github.com/reservoirprotocol/indexer/commit/49dc6baef4c88ada02eede652f49442393b72eec))


### Features

* update tokens bootstrap api to work off the cached token columns ([74c9de2](https://github.com/reservoirprotocol/indexer/commit/74c9de20e6a272b41c21fbe870a7d52cc09cbdcd))



## [5.30.32](https://github.com/reservoirprotocol/indexer/compare/v5.30.31...v5.30.32) (2022-04-23)


### Features

* order api improvements ([9c9a8d7](https://github.com/reservoirprotocol/indexer/commit/9c9a8d72109d3bca54b9fd2df3f345be544f415b))



## [5.30.31](https://github.com/reservoirprotocol/indexer/compare/v5.30.30...v5.30.31) (2022-04-22)


### Bug Fixes

* tweaks ([a561de5](https://github.com/reservoirprotocol/indexer/commit/a561de5cdba032ca60df4c076ab2b5deca57c7af))


### Features

* historical daily volumes data api ([9b74c6e](https://github.com/reservoirprotocol/indexer/commit/9b74c6e905444c9e99590b9c664f060f011c19a4))
* historical daily volumes data api ([408f157](https://github.com/reservoirprotocol/indexer/commit/408f157f760f6cde987641d50475e2776a38fe79))



## [5.30.30](https://github.com/reservoirprotocol/indexer/compare/v5.30.29...v5.30.30) (2022-04-22)


### Bug Fixes

* tweaks ([44a6a10](https://github.com/reservoirprotocol/indexer/commit/44a6a10bc549b7f5e07d6b2aac3c13288b8573db))



## [5.30.29](https://github.com/reservoirprotocol/indexer/compare/v5.30.28...v5.30.29) (2022-04-22)


### Bug Fixes

* tweaks ([1b32ec9](https://github.com/reservoirprotocol/indexer/commit/1b32ec9809aa8a622ccbe70398ee975cb0cf75dd))



## [5.30.28](https://github.com/reservoirprotocol/indexer/compare/v5.30.27...v5.30.28) (2022-04-22)


### Features

* wip ([b0d654c](https://github.com/reservoirprotocol/indexer/commit/b0d654c370480adabb57540daee56d798e75fa14))



## [5.30.27](https://github.com/reservoirprotocol/indexer/compare/v5.30.26...v5.30.27) (2022-04-22)


### Bug Fixes

* add logging ([8e90a1e](https://github.com/reservoirprotocol/indexer/commit/8e90a1ebca037e89da6e4eefbecf711ba68bbf9d))
* temporary script to backfill token caches ([2c24827](https://github.com/reservoirprotocol/indexer/commit/2c2482730ffe4a2fdfe4e320fdb764d0f4053170))



## [5.30.26](https://github.com/reservoirprotocol/indexer/compare/v5.30.25...v5.30.26) (2022-04-22)


### Bug Fixes

* tweaks ([8475443](https://github.com/reservoirprotocol/indexer/commit/847544305cb1e43fa71cc0415709f6a52a4ea5de))



## [5.30.25](https://github.com/reservoirprotocol/indexer/compare/v5.30.24...v5.30.25) (2022-04-22)


### Bug Fixes

* tweaks ([25b084b](https://github.com/reservoirprotocol/indexer/commit/25b084b1c4b35e7c8e900e534cb83bf5f19e5eb2))
* update fix cache api ([aee3b78](https://github.com/reservoirprotocol/indexer/commit/aee3b782c113830ae6b977f649037d1ef8aefffa))


### Features

* improved token floor sell caching ([c1cdafd](https://github.com/reservoirprotocol/indexer/commit/c1cdafdf902dffb55e1c7dff314582c25585e6db))



## [5.30.24](https://github.com/reservoirprotocol/indexer/compare/v5.30.23...v5.30.24) (2022-04-21)



## [5.30.23](https://github.com/reservoirprotocol/indexer/compare/v5.30.22...v5.30.23) (2022-04-21)


### Features

* keep orderbook in the orders table ([3f80fba](https://github.com/reservoirprotocol/indexer/commit/3f80fbaa15774b90c71ff5793fcdaf355a413737))



## [5.30.22](https://github.com/reservoirprotocol/indexer/compare/v5.30.21...v5.30.22) (2022-04-21)


### Bug Fixes

* tweaks ([db529fc](https://github.com/reservoirprotocol/indexer/commit/db529fc3c9505303ed582df7bd5824316b49de2e))
* tweaks ([11fac47](https://github.com/reservoirprotocol/indexer/commit/11fac47894fa99a18d78a77891aee3406dac07a9))
* tweaks ([2d4b453](https://github.com/reservoirprotocol/indexer/commit/2d4b453c8b487398ab5797b960045237d8c00bb8))


### Features

* integrate fixing all orders on a particular token ([24d788c](https://github.com/reservoirprotocol/indexer/commit/24d788c2e8a91f74639a988275d1914fc01fb539))



## [5.30.21](https://github.com/reservoirprotocol/indexer/compare/v5.30.20...v5.30.21) (2022-04-21)


### Bug Fixes

* orders bids api ([00fb89a](https://github.com/reservoirprotocol/indexer/commit/00fb89a37a6773fe7143453ef85f682fea4c8730))



## [5.30.20](https://github.com/reservoirprotocol/indexer/compare/v5.30.19...v5.30.20) (2022-04-21)


### Bug Fixes

* missing source from orders all api ([f141695](https://github.com/reservoirprotocol/indexer/commit/f1416955aa9cec34982007c37b8378261531a559))


### Features

* order apis improvements ([9f568fd](https://github.com/reservoirprotocol/indexer/commit/9f568fd5da86d29a8bc47c02aa84b1eb968c3f0e))



## [5.30.19](https://github.com/reservoirprotocol/indexer/compare/v5.30.18...v5.30.19) (2022-04-21)


### Features

* better indexed for fill events ([f6ea7ed](https://github.com/reservoirprotocol/indexer/commit/f6ea7edfa9d40be2da43e6f44268483d2ee6800e))



## [5.30.18](https://github.com/reservoirprotocol/indexer/compare/v5.30.17...v5.30.18) (2022-04-21)


### Bug Fixes

* redeploy ([7360cd7](https://github.com/reservoirprotocol/indexer/commit/7360cd7258cedc639fc61ee68d55f50e1f7ac98a))
* tweak query ([a6087b1](https://github.com/reservoirprotocol/indexer/commit/a6087b1ead4d44e7146e231234439a92a4c2aa6a))


### Features

* include order quantity remaining ([62c7488](https://github.com/reservoirprotocol/indexer/commit/62c7488247ea6d37c0985b06c80497d8d695d91c))
* integrate order events ([4eb1485](https://github.com/reservoirprotocol/indexer/commit/4eb1485a09f494c5672fde66254b9d8dd88c4d23))
* integrate order events api ([5248df2](https://github.com/reservoirprotocol/indexer/commit/5248df256548a906a0380f8c5157626c4965a7a4))



## [5.30.17](https://github.com/reservoirprotocol/indexer/compare/v5.30.16...v5.30.17) (2022-04-20)



## [5.30.16](https://github.com/reservoirprotocol/indexer/compare/v5.30.15...v5.30.16) (2022-04-20)



## [5.30.15](https://github.com/reservoirprotocol/indexer/compare/v5.30.14...v5.30.15) (2022-04-19)


### Bug Fixes

* tweak ([1712b29](https://github.com/reservoirprotocol/indexer/commit/1712b2951594b1fe8975d36cebc80e7dd2842f9d))



## [5.30.14](https://github.com/reservoirprotocol/indexer/compare/v5.30.13...v5.30.14) (2022-04-19)


### Bug Fixes

* tweaks ([7d93ce8](https://github.com/reservoirprotocol/indexer/commit/7d93ce8ecd9d039c2ad9775c7f22f7b0016132ed))



## [5.30.13](https://github.com/reservoirprotocol/indexer/compare/v5.30.12...v5.30.13) (2022-04-19)


### Bug Fixes

* tweaks ([bd4f46a](https://github.com/reservoirprotocol/indexer/commit/bd4f46a22997c20205f0c408b9fe6b5df184d825))



## [5.30.12](https://github.com/reservoirprotocol/indexer/compare/v5.30.11...v5.30.12) (2022-04-19)


### Bug Fixes

* use post /order/v2 api ([c867945](https://github.com/reservoirprotocol/indexer/commit/c86794549c88ec6b5d538c8b8c479b4731f6fada))



## [5.30.11](https://github.com/reservoirprotocol/indexer/compare/v5.30.10...v5.30.11) (2022-04-19)


### Bug Fixes

* fix undefined network occurrences (very weird) ([103ec86](https://github.com/reservoirprotocol/indexer/commit/103ec862a8531587c9f0fdefec835a648733244b))



## [5.30.10](https://github.com/reservoirprotocol/indexer/compare/v5.30.9...v5.30.10) (2022-04-19)


### Bug Fixes

* tweaks ([861433d](https://github.com/reservoirprotocol/indexer/commit/861433d9cd585dd4d6fbf89b3a94c55cc5c95e31))



## [5.30.9](https://github.com/reservoirprotocol/indexer/compare/v5.30.8...v5.30.9) (2022-04-18)


### Bug Fixes

* tweaks ([cfc67a9](https://github.com/reservoirprotocol/indexer/commit/cfc67a9edee70b4e6e7453dc5aec65eb73233b6a))



## [5.30.8](https://github.com/reservoirprotocol/indexer/compare/v5.30.7...v5.30.8) (2022-04-18)


### Bug Fixes

* tweaks ([c5d2d99](https://github.com/reservoirprotocol/indexer/commit/c5d2d993446e7bfb812560cf9649026d5aa601fe))



## [5.30.7](https://github.com/reservoirprotocol/indexer/compare/v5.30.6...v5.30.7) (2022-04-18)


### Bug Fixes

* tweaks ([793bf00](https://github.com/reservoirprotocol/indexer/commit/793bf00531c2a6bed48ed0bb8e90dca6915bfc88))
* various tweaks ([be9388e](https://github.com/reservoirprotocol/indexer/commit/be9388e442d4a0b2cd81e2020cf176c8e1377ab7))



## [5.30.6](https://github.com/reservoirprotocol/indexer/compare/v5.30.5...v5.30.6) (2022-04-18)


### Bug Fixes

* various tweaks ([fb967a9](https://github.com/reservoirprotocol/indexer/commit/fb967a99873bd596a37dac7277254645c520e8b4))



## [5.30.5](https://github.com/reservoirprotocol/indexer/compare/v5.30.4...v5.30.5) (2022-04-18)


### Bug Fixes

* buffer collection floor ask queue ([049e60b](https://github.com/reservoirprotocol/indexer/commit/049e60be1a72556a46d5d745e4f783aaa40233d9))
* debugging ([169f2cb](https://github.com/reservoirprotocol/indexer/commit/169f2cb4835d9c485e2f794fe0325cd9710227f1))
* debugging ([1257ff7](https://github.com/reservoirprotocol/indexer/commit/1257ff7789d1fb4abb704854454c0150c594b061))
* debugging ([b7735dc](https://github.com/reservoirprotocol/indexer/commit/b7735dcfca9c8fdc2765560c4a0220f882798dee))
* debugging ([3f63491](https://github.com/reservoirprotocol/indexer/commit/3f63491a0595ee76f418346b34f8f7e8d112d985))
* debugging ([fe07829](https://github.com/reservoirprotocol/indexer/commit/fe078293262ffe670fbe6b62a7ec198c12d8aa7f))


### Features

* allow fetching all orders without source/contract filtering ([35a1452](https://github.com/reservoirprotocol/indexer/commit/35a14522b093f0d609f9333b4d19c4662e6b5b9e))
* integrate collection floor sell events ([79c5830](https://github.com/reservoirprotocol/indexer/commit/79c58302a0b492464d1119bcafc726facba75681))
* integrate collections floor ask events api ([78fadf2](https://github.com/reservoirprotocol/indexer/commit/78fadf258d5aab8ad5cf743ae4b3d292897ecc93))
* return image in the tokens bootstrap api ([f0559ab](https://github.com/reservoirprotocol/indexer/commit/f0559ab467c580b2744b3e76d9a76c669379c37b))


### Performance Improvements

* try tuning orders table autovacuum settings ([d73a650](https://github.com/reservoirprotocol/indexer/commit/d73a6505ebed72a447ef12fb5991fca9eb4f90de))



## [5.30.4](https://github.com/reservoirprotocol/indexer/compare/v5.30.3...v5.30.4) (2022-04-18)


### Bug Fixes

* filter out 0 price events ([4cbb9b9](https://github.com/reservoirprotocol/indexer/commit/4cbb9b937550e2d53ac961f2c320062f955b2532))


### Features

* add volumes and floorsales to collection responses ([a3be43e](https://github.com/reservoirprotocol/indexer/commit/a3be43e9f59d109f041742703e45fcb08457b6de))



## [5.30.3](https://github.com/reservoirprotocol/indexer/compare/v5.30.2...v5.30.3) (2022-04-18)


### Features

* improved tokens bootstrap api ([9fa5499](https://github.com/reservoirprotocol/indexer/commit/9fa5499f03bd80b9269f7c8f46f75f2d2b55bd4e))



## [5.30.2](https://github.com/reservoirprotocol/indexer/compare/v5.30.1...v5.30.2) (2022-04-18)


### Bug Fixes

* allow passing a quantity when bidding/listing ([5e506ab](https://github.com/reservoirprotocol/indexer/commit/5e506ab453f8c4c51f9186e7213eaf043c5469ff))
* update error message ([ad1e6a6](https://github.com/reservoirprotocol/indexer/commit/ad1e6a642d62e383ef6dcd16c2187099bc42973e))



## [5.30.1](https://github.com/reservoirprotocol/indexer/compare/v5.30.0...v5.30.1) (2022-04-18)


### Bug Fixes

* update tokens bootstrap api ([b9a9107](https://github.com/reservoirprotocol/indexer/commit/b9a9107be813275077cde51307cb456df8dac0f7))



# [5.30.0](https://github.com/reservoirprotocol/indexer/compare/v5.29.0...v5.30.0) (2022-04-18)


### Features

* add caching to bulk sales ([c734426](https://github.com/reservoirprotocol/indexer/commit/c7344265fbca7fc68ed6d7b2a60774390fceedf7))



# [5.29.0](https://github.com/reservoirprotocol/indexer/compare/v5.28.4...v5.29.0) (2022-04-18)


### Features

* add caching to floor ask v2 ([de24603](https://github.com/reservoirprotocol/indexer/commit/de24603f566c590108d7e72584a1d98861c5f79d))



## [5.28.4](https://github.com/reservoirprotocol/indexer/compare/v5.28.3...v5.28.4) (2022-04-17)


### Bug Fixes

* increase lock time to 4 hours ([4fac26a](https://github.com/reservoirprotocol/indexer/commit/4fac26a980bb4488b0d8f9fb8ccbff2d221ac7ea))
* stopping collections update for now ([3f7148a](https://github.com/reservoirprotocol/indexer/commit/3f7148a4fce431ea34425b43d52971cdff68a76d))



## [5.28.3](https://github.com/reservoirprotocol/indexer/compare/v5.28.2...v5.28.3) (2022-04-17)


### Bug Fixes

* avoid doing the collection update more than once an hour ([8561427](https://github.com/reservoirprotocol/indexer/commit/85614276bb35bfd3f7e3047109e17fc5ec18b5d9))



## [5.28.2](https://github.com/reservoirprotocol/indexer/compare/v5.28.1...v5.28.2) (2022-04-17)


### Features

* daily-volumes and collections additions ([2bbddbd](https://github.com/reservoirprotocol/indexer/commit/2bbddbd2037ae5a2ada3f66cf4514e1f40f15926))



## [5.28.1](https://github.com/reservoirprotocol/indexer/compare/v5.28.0...v5.28.1) (2022-04-16)


### Bug Fixes

* stop collection refresh ([e6dd4fb](https://github.com/reservoirprotocol/indexer/commit/e6dd4fb8925e97612250a33d9f5acbd22126e1ee))



# [5.28.0](https://github.com/reservoirprotocol/indexer/compare/v5.27.0...v5.28.0) (2022-04-16)


### Features

* get top 50 collections ([0b426bd](https://github.com/reservoirprotocol/indexer/commit/0b426bd3ba98a2eb71a06673eb88848d5eb9a6a2))



# [5.27.0](https://github.com/reservoirprotocol/indexer/compare/v5.26.4...v5.27.0) (2022-04-16)


### Features

* update backoff ([9b146b9](https://github.com/reservoirprotocol/indexer/commit/9b146b9ced4296a3ea5db9ee8be60b45b705243a))



## [5.26.4](https://github.com/reservoirprotocol/indexer/compare/v5.26.3...v5.26.4) (2022-04-15)


### Features

* update collections freshness ([58dfedc](https://github.com/reservoirprotocol/indexer/commit/58dfedc7d6d8178bada9368650531833c2669c63))



## [5.26.3](https://github.com/reservoirprotocol/indexer/compare/v5.26.2...v5.26.3) (2022-04-15)


### Features

* resume queue ([b51e881](https://github.com/reservoirprotocol/indexer/commit/b51e881b2292d3977b4ddde9f7bc453132da1557))



## [5.26.2](https://github.com/reservoirprotocol/indexer/compare/v5.26.1...v5.26.2) (2022-04-15)


### Features

* resume queue ([82de2b1](https://github.com/reservoirprotocol/indexer/commit/82de2b126ac1f038a866c77c83758950a963736a))



## [5.26.1](https://github.com/reservoirprotocol/indexer/compare/v5.26.0...v5.26.1) (2022-04-15)


### Features

* resume queue ([1204545](https://github.com/reservoirprotocol/indexer/commit/1204545ac865f44e647ee7b271ae65fd3ceb173a))



# [5.26.0](https://github.com/reservoirprotocol/indexer/compare/v5.25.5...v5.26.0) (2022-04-15)


### Features

* pause queue ([bc347ea](https://github.com/reservoirprotocol/indexer/commit/bc347ea7d0f5369581a2d80153b406d45520facf))



## [5.25.5](https://github.com/reservoirprotocol/indexer/compare/v5.25.4...v5.25.5) (2022-04-15)


### Features

* store attribute last updated ([a5c6259](https://github.com/reservoirprotocol/indexer/commit/a5c62591d7daf66738d49521b70b22d381fe1ed1))
* store attribute last updated ([f5d5e84](https://github.com/reservoirprotocol/indexer/commit/f5d5e84955d48b3cd283b5e46870fe0a74fc9139))



## [5.25.4](https://github.com/reservoirprotocol/indexer/compare/v5.25.3...v5.25.4) (2022-04-15)


### Bug Fixes

* properly handle 0 as expiration time ([2fc4f50](https://github.com/reservoirprotocol/indexer/commit/2fc4f50b8c3d181052b8f437b193bf01fa1f43fa))
* properly handle 0 as expiration time ([cc83629](https://github.com/reservoirprotocol/indexer/commit/cc83629c2f115180c257876c17d48b616c04eb6c))
* properly handle 0 as expiration time ([5ff2e8a](https://github.com/reservoirprotocol/indexer/commit/5ff2e8a40e85941f70ca1cceb7b9dfe775e75c19))
* proxy zeroex-v4 orders to 721ex on rinkeby ([5bf8036](https://github.com/reservoirprotocol/indexer/commit/5bf8036d12536bf735bffe9d64fb4de8042b67df))
* skip taker's listings on multi buy ([6c01663](https://github.com/reservoirprotocol/indexer/commit/6c01663b4372b74536787870d9b894d8336af03d))


### Features

* integrate tokens bootstrap api ([6d3f62a](https://github.com/reservoirprotocol/indexer/commit/6d3f62a637cfc8a56a1f2c59cca1b58cb5727af6))



## [5.25.3](https://github.com/reservoirprotocol/indexer/compare/v5.25.2...v5.25.3) (2022-04-15)


### Bug Fixes

* various tweaks ([3cb698d](https://github.com/reservoirprotocol/indexer/commit/3cb698d8f313cba8f7abf2aa392a0165be28b4ad))



## [5.25.2](https://github.com/reservoirprotocol/indexer/compare/v5.25.1...v5.25.2) (2022-04-14)


### Features

* resume order source backfill ([0c767c1](https://github.com/reservoirprotocol/indexer/commit/0c767c162619cfe87268220a732582649047e17f))



## [5.25.1](https://github.com/reservoirprotocol/indexer/compare/v5.25.0...v5.25.1) (2022-04-14)


### Bug Fixes

* various tweaks ([175bdea](https://github.com/reservoirprotocol/indexer/commit/175bdeac68f7b09e224d79de50d668c3a95ef48f))



# [5.25.0](https://github.com/reservoirprotocol/indexer/compare/v5.24.2...v5.25.0) (2022-04-14)


### Features

* resume order source backfill ([56e91bf](https://github.com/reservoirprotocol/indexer/commit/56e91bfe542ccc9ec909f512ddf64cb905d7b6e1))



## [5.24.2](https://github.com/reservoirprotocol/indexer/compare/v5.24.1...v5.24.2) (2022-04-14)


### Bug Fixes

* various tweaks ([c53e7ac](https://github.com/reservoirprotocol/indexer/commit/c53e7ac29cbe6c270222edbc150c406c9e54da46))



## [5.24.1](https://github.com/reservoirprotocol/indexer/compare/v5.24.0...v5.24.1) (2022-04-14)


### Bug Fixes

* various tweaks ([67aa105](https://github.com/reservoirprotocol/indexer/commit/67aa105c516ec114ea938d2e005be31d0b1b1bb2))



# [5.24.0](https://github.com/reservoirprotocol/indexer/compare/v5.23.10...v5.24.0) (2022-04-14)


### Features

* stop order source backfill ([a26c1d7](https://github.com/reservoirprotocol/indexer/commit/a26c1d79c7291959a995d836b34a93bdc335a999))



## [5.23.10](https://github.com/reservoirprotocol/indexer/compare/v5.23.9...v5.23.10) (2022-04-14)


### Bug Fixes

* proper source in v2 floor-ask events ([39551d1](https://github.com/reservoirprotocol/indexer/commit/39551d1782cc67bde0eb0385cef58619f2fad569))



## [5.23.9](https://github.com/reservoirprotocol/indexer/compare/v5.23.8...v5.23.9) (2022-04-14)


### Features

* added logo redirect url ([04fcf6f](https://github.com/reservoirprotocol/indexer/commit/04fcf6fdd76bf7e13306c90cf3e194168881c2c1))
* added sources caching ([a260242](https://github.com/reservoirprotocol/indexer/commit/a260242e260f685026b7d75bf80372b5126c3b3f))
* added token redirect url ([014b14c](https://github.com/reservoirprotocol/indexer/commit/014b14cac971b94910c6b72d3ad7bb7e9fa3ee12))
* cleanup ([8274b3c](https://github.com/reservoirprotocol/indexer/commit/8274b3cfdfa6f28b0fc9c62734dea78d5b685cdf))
* create new sources table ([ab27e2f](https://github.com/reservoirprotocol/indexer/commit/ab27e2fc65ba28c2baf5637bff664be1c7ecbf0a))
* fix bugs ([3b9a52c](https://github.com/reservoirprotocol/indexer/commit/3b9a52c5245cb1d115bf7366e49415ce46a4c04d))
* fix bugs ([e57ea87](https://github.com/reservoirprotocol/indexer/commit/e57ea87ef3f9078a35763388403fb357b1a0f763))
* generate sources on the fly ([86c1c2b](https://github.com/reservoirprotocol/indexer/commit/86c1c2b7227ba89fd4ca765d952f0d0cbb9692f3))
* lower case name ([793ce7d](https://github.com/reservoirprotocol/indexer/commit/793ce7df7aca35314f6797b4ccf71983aa333e3a))
* lower case name ([3bb3aac](https://github.com/reservoirprotocol/indexer/commit/3bb3aacb75c712cfdb691024bd936f60b44a9612))
* new sources table ([058e302](https://github.com/reservoirprotocol/indexer/commit/058e302a462ccddd927827a84ff33a651e284c89))
* reload cache ([f358990](https://github.com/reservoirprotocol/indexer/commit/f358990397b638223929c836c7f7c7818b702c07))
* update bids and asks API ([66d95af](https://github.com/reservoirprotocol/indexer/commit/66d95af16290236226faf4ca67c72db8ea4b81dd))
* update execute bid/list and orders API ([33a7d2f](https://github.com/reservoirprotocol/indexer/commit/33a7d2f77aaa94bb64fce9dba34f7138fe7309c0))
* use address for backwards support ([a76c091](https://github.com/reservoirprotocol/indexer/commit/a76c091d6eb8438f88fb930f5dfec4d1ef0f69c1))
* wip ([c81d457](https://github.com/reservoirprotocol/indexer/commit/c81d4570979faafd2ca6039ea0931995b0d260dc))
* wip ([cc2eee1](https://github.com/reservoirprotocol/indexer/commit/cc2eee13bab171fabe8e06d4bd1efb055fd43da0))



## [5.23.8](https://github.com/reservoirprotocol/indexer/compare/v5.23.7...v5.23.8) (2022-04-14)


### Bug Fixes

* debugging ([470b2aa](https://github.com/reservoirprotocol/indexer/commit/470b2aa80d859713bc770105c171f0c1665898db))
* debugging ([debed3c](https://github.com/reservoirprotocol/indexer/commit/debed3c8a1045dc3a1df9d3e61fe803cf02c3bbe))
* remove debug logs ([4e63c8d](https://github.com/reservoirprotocol/indexer/commit/4e63c8de14022e1d923a70c3a8645c46efd4d354))



## [5.23.7](https://github.com/reservoirprotocol/indexer/compare/v5.23.6...v5.23.7) (2022-04-14)


### Bug Fixes

* lower limit ([b01a295](https://github.com/reservoirprotocol/indexer/commit/b01a295554afadd91b3c370e2f4a0a5315d82ec6))



## [5.23.6](https://github.com/reservoirprotocol/indexer/compare/v5.23.5...v5.23.6) (2022-04-14)


### Bug Fixes

* minor tweaks ([c6cb468](https://github.com/reservoirprotocol/indexer/commit/c6cb468952233fce8ce914c359f45a2f449e0de7))
* minor tweaks ([2cc6035](https://github.com/reservoirprotocol/indexer/commit/2cc6035d27d116376633c361d0a53811f834a5b8))



## [5.23.5](https://github.com/reservoirprotocol/indexer/compare/v5.23.4...v5.23.5) (2022-04-14)


### Bug Fixes

* minor tweaks ([52df2d4](https://github.com/reservoirprotocol/indexer/commit/52df2d4d216a48325bf04bc61b2b54199c5934a4))
* update expired orders in batches ([21afafa](https://github.com/reservoirprotocol/indexer/commit/21afafabb196d7121ddb154955589ed26b7504f6))



## [5.23.4](https://github.com/reservoirprotocol/indexer/compare/v5.23.3...v5.23.4) (2022-04-14)


### Features

* return token kind in token details ([a1f5810](https://github.com/reservoirprotocol/indexer/commit/a1f58105e2351652ce8841763a8ffe71cb5996a9))



## [5.23.3](https://github.com/reservoirprotocol/indexer/compare/v5.23.2...v5.23.3) (2022-04-13)


### Features

* improve orders all api ([fdcd5a0](https://github.com/reservoirprotocol/indexer/commit/fdcd5a087ba2ffcdbb954816cb359198b576f2d1))



## [5.23.2](https://github.com/reservoirprotocol/indexer/compare/v5.23.1...v5.23.2) (2022-04-13)


### Features

* include order source in the sales apis ([3daa4bb](https://github.com/reservoirprotocol/indexer/commit/3daa4bbe5d5d5f47770c99c4f823f0a510b7a86d))



## [5.23.1](https://github.com/reservoirprotocol/indexer/compare/v5.23.0...v5.23.1) (2022-04-12)


### Features

* implement v2 of tokens floor ask events api ([60fc731](https://github.com/reservoirprotocol/indexer/commit/60fc731f423eed6a21d084d6645b2b49b8fa582c))



# [5.23.0](https://github.com/reservoirprotocol/indexer/compare/v5.22.0...v5.23.0) (2022-04-12)


### Features

* better locking on metadata queue ([76688e2](https://github.com/reservoirprotocol/indexer/commit/76688e2cf8fe27b9e0882d086574ee23069ce958))



# [5.22.0](https://github.com/reservoirprotocol/indexer/compare/v5.21.2...v5.22.0) (2022-04-12)


### Features

* wip ([819e4ac](https://github.com/reservoirprotocol/indexer/commit/819e4ac0661c6b28c6a918f0e069e165f7563e2f))



## [5.21.2](https://github.com/reservoirprotocol/indexer/compare/v5.21.1...v5.21.2) (2022-04-12)


### Bug Fixes

* add missing approval transaction when listing zeroex-v4/opendao ([e9cd2f7](https://github.com/reservoirprotocol/indexer/commit/e9cd2f7cd491ace92592dc1c631d987ed696848d))
* non-deterministic orders ([72a6e7b](https://github.com/reservoirprotocol/indexer/commit/72a6e7b55346a04c5869d3c828352d04fa767fd1))
* proper flow of interaction for execute apis ([ef043b4](https://github.com/reservoirprotocol/indexer/commit/ef043b4505f85e127b6914aade83cd023639472d))
* skip setting royalties if empty ([fa88a74](https://github.com/reservoirprotocol/indexer/commit/fa88a7499bc6db7f4eef081325b97cc4c4fa6903))



## [5.21.1](https://github.com/reservoirprotocol/indexer/compare/v5.21.0...v5.21.1) (2022-04-12)


### Bug Fixes

* tweak batch buying ([e797a46](https://github.com/reservoirprotocol/indexer/commit/e797a4635fa7ef4c8c256e9b1de2de52bef4b44c))


### Features

* add support for quantity in the execute buy api ([50626ac](https://github.com/reservoirprotocol/indexer/commit/50626ac900f6e4df27be07fabea793ba42771956))
* support sorting asks and bids apis by price ([9cf55af](https://github.com/reservoirprotocol/indexer/commit/9cf55af3a640607c39379ab8db5b4c309a8c48fe))



# [5.21.0](https://github.com/reservoirprotocol/indexer/compare/v5.20.2...v5.21.0) (2022-04-11)


### Features

* added script to resync orders source ([07ec3f6](https://github.com/reservoirprotocol/indexer/commit/07ec3f6b1906ef3dcd37816fda39db6eff2d5e72))



## [5.20.2](https://github.com/reservoirprotocol/indexer/compare/v5.20.1...v5.20.2) (2022-04-11)


### Features

* added script to resync orders source ([8a5f849](https://github.com/reservoirprotocol/indexer/commit/8a5f84909935be8da869257e728784a3bae3bffd))
* added script to resync orders source ([ad842f9](https://github.com/reservoirprotocol/indexer/commit/ad842f99885e18866a5ce21cdd814b78ffb7d75b))
* added script to resync orders source ([a8ba1b5](https://github.com/reservoirprotocol/indexer/commit/a8ba1b5cd5610abcdc8ce087a354157349850bc9))
* added script to resync orders source ([2fda1c4](https://github.com/reservoirprotocol/indexer/commit/2fda1c4114525ffb0986ca0059b7bd3a5718ece4))



## [5.20.1](https://github.com/reservoirprotocol/indexer/compare/v5.20.0...v5.20.1) (2022-04-11)


### Features

* disable slug resync ([d5c2c9d](https://github.com/reservoirprotocol/indexer/commit/d5c2c9d9a96e8f8e21e21b8c7bee0da270410530))



# [5.20.0](https://github.com/reservoirprotocol/indexer/compare/v5.19.6...v5.20.0) (2022-04-11)


### Features

* disable slug resync ([4287492](https://github.com/reservoirprotocol/indexer/commit/428749280ba0115476bd20b1f8e4af079ec2586e))



## [5.19.6](https://github.com/reservoirprotocol/indexer/compare/v5.19.5...v5.19.6) (2022-04-11)


### Features

* integrate websocket subscription for faster events syncing ([58a6cd2](https://github.com/reservoirprotocol/indexer/commit/58a6cd2f9eebdc84bb77462467721548b2f5ada2))



## [5.19.5](https://github.com/reservoirprotocol/indexer/compare/v5.19.4...v5.19.5) (2022-04-11)


### Bug Fixes

* do not recheck unfillable orders ([ac1f3a8](https://github.com/reservoirprotocol/indexer/commit/ac1f3a8cc183d456b880df4a6a4b14628319f238))



## [5.19.4](https://github.com/reservoirprotocol/indexer/compare/v5.19.3...v5.19.4) (2022-04-11)


### Features

* minor improvements ([c235dd9](https://github.com/reservoirprotocol/indexer/commit/c235dd9c53ea2a8aea0831813eb9699f8bbd5153))
* support fee recipient on top of royalties for zeroex-v4/opendao orders ([694250c](https://github.com/reservoirprotocol/indexer/commit/694250c585de9fb1e96323d14de8574e2b0ef143))



## [5.19.3](https://github.com/reservoirprotocol/indexer/compare/v5.19.2...v5.19.3) (2022-04-10)


### Bug Fixes

* add source in the bid/list apis ([c64eac5](https://github.com/reservoirprotocol/indexer/commit/c64eac5a7d91b94e5b4de5bccc0879f28b056e03))



## [5.19.2](https://github.com/reservoirprotocol/indexer/compare/v5.19.1...v5.19.2) (2022-04-09)


### Bug Fixes

* hexlify custom gas values ([52916e1](https://github.com/reservoirprotocol/indexer/commit/52916e133e5e92fa5d55ff7cc278fc2bd9c88085))



## [5.19.1](https://github.com/reservoirprotocol/indexer/compare/v5.19.0...v5.19.1) (2022-04-08)


### Features

* added collection slug resync ([3d48389](https://github.com/reservoirprotocol/indexer/commit/3d48389453bfe5db4e0cfcb6673cbf56c0389b4d))



# [5.19.0](https://github.com/reservoirprotocol/indexer/compare/v5.18.1...v5.19.0) (2022-04-08)


### Features

* added collection slug resync ([0edaa62](https://github.com/reservoirprotocol/indexer/commit/0edaa621a1a94b8e5fcc01ccaa365e272ffb688d))



## [5.18.1](https://github.com/reservoirprotocol/indexer/compare/v5.18.0...v5.18.1) (2022-04-08)


### Features

* added collection slug resync ([b25adb5](https://github.com/reservoirprotocol/indexer/commit/b25adb5f8ab828f098858b605fac5c6406279f29))



# [5.18.0](https://github.com/reservoirprotocol/indexer/compare/v5.17.7...v5.18.0) (2022-04-08)


### Features

* remove logs ([a625a17](https://github.com/reservoirprotocol/indexer/commit/a625a17f51da88e6d050d6898d5ca3ad126ca802))



## [5.17.7](https://github.com/reservoirprotocol/indexer/compare/v5.17.6...v5.17.7) (2022-04-08)


### Features

* wip ([4cedf65](https://github.com/reservoirprotocol/indexer/commit/4cedf65a42855e2070aba27cc05347359f784b2a))



## [5.17.6](https://github.com/reservoirprotocol/indexer/compare/v5.17.5...v5.17.6) (2022-04-08)


### Features

* wip ([3f2ff26](https://github.com/reservoirprotocol/indexer/commit/3f2ff260a4c16487d4c0235be94d9a8a841df8b1))



## [5.17.5](https://github.com/reservoirprotocol/indexer/compare/v5.17.4...v5.17.5) (2022-04-08)


### Features

* wip ([988bd38](https://github.com/reservoirprotocol/indexer/commit/988bd38a8c7afbbbedf0e736aadaf83ba1db1927))



## [5.17.4](https://github.com/reservoirprotocol/indexer/compare/v5.17.3...v5.17.4) (2022-04-08)


### Features

* added logs ([d5e3731](https://github.com/reservoirprotocol/indexer/commit/d5e37314375da20c80e3e0aa48f2ed140e7f9007))



## [5.17.3](https://github.com/reservoirprotocol/indexer/compare/v5.17.2...v5.17.3) (2022-04-08)


### Features

* prevent multiple processing per method ([9c717f2](https://github.com/reservoirprotocol/indexer/commit/9c717f2aca54b6a86c856d9587698f1e8de61063))



## [5.17.2](https://github.com/reservoirprotocol/indexer/compare/v5.17.1...v5.17.2) (2022-04-08)


### Features

* prevent multiple processing per method ([d04addd](https://github.com/reservoirprotocol/indexer/commit/d04addd6c3851b1f91e190b1a62711474eb1f45e))



## [5.17.1](https://github.com/reservoirprotocol/indexer/compare/v5.17.0...v5.17.1) (2022-04-08)


### Features

* prevent multiple processing per method ([78e75ca](https://github.com/reservoirprotocol/indexer/commit/78e75ca6aceaa8068575364ed7fa70580172cc2b))



# [5.17.0](https://github.com/reservoirprotocol/indexer/compare/v5.16.4...v5.17.0) (2022-04-08)


### Features

* update refresh date ([8385ce4](https://github.com/reservoirprotocol/indexer/commit/8385ce4cd141159c0c83fa51d5eec8a5054e9196))



## [5.16.4](https://github.com/reservoirprotocol/indexer/compare/v5.16.3...v5.16.4) (2022-04-08)


### Features

* store collection minted timestamp ([7da5151](https://github.com/reservoirprotocol/indexer/commit/7da5151988d839e41d4876c176bc865ed0446159))
* store collection minted timestamp ([a476608](https://github.com/reservoirprotocol/indexer/commit/a4766089fe3e44c2a2b7c8b2c15669872a13852b))



## [5.16.3](https://github.com/reservoirprotocol/indexer/compare/v5.16.2...v5.16.3) (2022-04-08)


### Features

* update slug when refreshing ([4b4078b](https://github.com/reservoirprotocol/indexer/commit/4b4078bc3afaa00c8d3f92fa038bbaa0cf25904c))



## [5.16.2](https://github.com/reservoirprotocol/indexer/compare/v5.16.1...v5.16.2) (2022-04-08)


### Features

* support native opensea orders ([c7b5157](https://github.com/reservoirprotocol/indexer/commit/c7b5157ed0aba5178c318b595a73d706b1a8b481))



## [5.16.1](https://github.com/reservoirprotocol/indexer/compare/v5.16.0...v5.16.1) (2022-04-08)


### Features

* ignore null attribute IDs ([0d8dec1](https://github.com/reservoirprotocol/indexer/commit/0d8dec1dee18f3a36cc2eb8656cbee4fdb968f2d))



# [5.16.0](https://github.com/reservoirprotocol/indexer/compare/v5.15.6...v5.16.0) (2022-04-08)


### Features

* added log ([933041c](https://github.com/reservoirprotocol/indexer/commit/933041cb6dd1c5890c42ca624515c122b3dfe3a7))



## [5.15.6](https://github.com/reservoirprotocol/indexer/compare/v5.15.5...v5.15.6) (2022-04-08)


### Features

* allow mixed chars cases ([d3f09ff](https://github.com/reservoirprotocol/indexer/commit/d3f09ff44cafb6d4bf1d7ef4f21ba9c4a4c08691))
* allow upper case ([0893fb0](https://github.com/reservoirprotocol/indexer/commit/0893fb0c6729d86eebb4ed5a733cc01ccae92aa0))



## [5.15.5](https://github.com/reservoirprotocol/indexer/compare/v5.15.4...v5.15.5) (2022-04-08)


### Features

* support custom gas settings when cancelling ([46b27b4](https://github.com/reservoirprotocol/indexer/commit/46b27b4efad433f42fc506faf0d6bcd05e643b36))



## [5.15.4](https://github.com/reservoirprotocol/indexer/compare/v5.15.3...v5.15.4) (2022-04-08)


### Features

* support custom gas settings when filling ([61a8e40](https://github.com/reservoirprotocol/indexer/commit/61a8e4080b0cf53cc6dbe2f9400bdc124f1dcdca))



## [5.15.3](https://github.com/reservoirprotocol/indexer/compare/v5.15.2...v5.15.3) (2022-04-08)


### Bug Fixes

* handle multiple attribute updates ([2a9824d](https://github.com/reservoirprotocol/indexer/commit/2a9824dfec110970c3b73992c73621d68e41daf8))



## [5.15.2](https://github.com/reservoirprotocol/indexer/compare/v5.15.1...v5.15.2) (2022-04-08)


### Features

* integrate zeroex-v4 ([a9dec14](https://github.com/reservoirprotocol/indexer/commit/a9dec1466a53ee81741508560935e20027a3cede))
* sync zeroex-v4 events ([051b766](https://github.com/reservoirprotocol/indexer/commit/051b766cc8b31aea8d498419e22d5c8b63ea5dc8))



## [5.15.1](https://github.com/reservoirprotocol/indexer/compare/v5.15.0...v5.15.1) (2022-04-08)


### Bug Fixes

* add missing looksrare event data ([c39d061](https://github.com/reservoirprotocol/indexer/commit/c39d061d4270e3023dedd2250d93b927cd864f9d))
* better order id detection from fills ([25b4aa9](https://github.com/reservoirprotocol/indexer/commit/25b4aa9fd847b791895ef7eb36048f5e578bf52f))
* change order kind for looks rare bulk cancel events ([0916d16](https://github.com/reservoirprotocol/indexer/commit/0916d16089167a7f3103cc9f634ca024b09c50d1))
* contination bug ([3d15c09](https://github.com/reservoirprotocol/indexer/commit/3d15c09a4563e20a9912d8768fb0bcd9657917c0))
* cover all cases where a fill's order id might be null ([c3b697d](https://github.com/reservoirprotocol/indexer/commit/c3b697da721e645fe8993ee515d6cb243d291024))
* do not cancel erc1155 orders with the same nonce when filling ([e9240ae](https://github.com/reservoirprotocol/indexer/commit/e9240ae3132e46815b48bb16dde58c2aa8478d82))
* enforce some uniqueness constraints for opendao order nonces ([ae6fcb7](https://github.com/reservoirprotocol/indexer/commit/ae6fcb73885fcf476d6dfb6e7cd7a97be48745ee))
* ignore fills having a null order id ([d40d550](https://github.com/reservoirprotocol/indexer/commit/d40d5501be39548b590457ab55266b64ef169d7f))
* proper opendao nonce retrieval ([41b157d](https://github.com/reservoirprotocol/indexer/commit/41b157dd9f346b676af575ecf5071e81f3d9b627))
* properly handle custom fills ([4d28583](https://github.com/reservoirprotocol/indexer/commit/4d28583c8ce3047935110bdb362f8a916c5cd88c))
* properly handle price/value of partially fillable orders ([5fc1a16](https://github.com/reservoirprotocol/indexer/commit/5fc1a167b7cff3868eb224babb4737c62ed0b899))
* remove duplicated import ([f9a8aad](https://github.com/reservoirprotocol/indexer/commit/f9a8aadb42245c9ff6304cc1d4fc53379710186f))
* repair build ([c7ef609](https://github.com/reservoirprotocol/indexer/commit/c7ef609d549a5795e00aaf2599b8712a6fdcc483))
* skip metadata write jobs with invalid data ([497a1bc](https://github.com/reservoirprotocol/indexer/commit/497a1bcc1ca90e7f1f01942e78efaabece563fa3))
* stringify price from looksrare events ([fa501cd](https://github.com/reservoirprotocol/indexer/commit/fa501cdc589b4aa367dc0dbed181c833255b8212))
* tweak ([59428ae](https://github.com/reservoirprotocol/indexer/commit/59428ae2deb4397ddbf82f7d1a533afe34e71cb0))
* tweaks ([c11c246](https://github.com/reservoirprotocol/indexer/commit/c11c246fc03dd7369929f3c6562fd6f9adbff0f3))
* update query for handling fills of zeroex-v4/opendao ([6bfc438](https://github.com/reservoirprotocol/indexer/commit/6bfc438350bbed39cf4686840666b8813f970919))
* update some conversions ([dadf274](https://github.com/reservoirprotocol/indexer/commit/dadf2749985853a9633fb9a5e699c05b05a7a491))
* use proper casting ([8b8d4ed](https://github.com/reservoirprotocol/indexer/commit/8b8d4ede6dd58c41a01f75cbdeea46102d505eed))
* use proper job context for partial filling ([903f17c](https://github.com/reservoirprotocol/indexer/commit/903f17cfe07af5c4db07aa0396e9a4d236687d00))
* user proper nonces when validating wyvern v2.3 orders ([2901c32](https://github.com/reservoirprotocol/indexer/commit/2901c32adedc3f9184ab0cf92f132fb8b93241fc))
* various fixes ([4971c24](https://github.com/reservoirprotocol/indexer/commit/4971c24550dd15c73f388c1e6638b6bb183976b6))
* various tweaks ([5282552](https://github.com/reservoirprotocol/indexer/commit/528255267a8b72e4c35715c0bae3314ebfce3dbe))


### Features

* add admin api for fixing orphaned blocks ([1af8bfa](https://github.com/reservoirprotocol/indexer/commit/1af8bfa5ccb69aa4cdfb8d5923978bc0500d3c3b))
* add continuation strings in base64 format ([245c929](https://github.com/reservoirprotocol/indexer/commit/245c92982eface47bfef783ae8b9588c988ae1f3))
* add exponential retry on calculate daily volume and more error checking ([#237](https://github.com/reservoirprotocol/indexer/issues/237)) ([c43c5f7](https://github.com/reservoirprotocol/indexer/commit/c43c5f79ee39ca7ae134e9c835d2a7367c7555f9))
* add sources table ([737f5aa](https://github.com/reservoirprotocol/indexer/commit/737f5aa41da6d0c56e228d75f02ba7a52870d96b))
* add support for opendao orders ([4163882](https://github.com/reservoirprotocol/indexer/commit/416388241cd2df0812950198dbf7b40e8bb016dc))
* add support for posting single opendao order ([8030abe](https://github.com/reservoirprotocol/indexer/commit/8030abe539900823aa19ce98ad3f56692a13eb64))
* add timestamp filtering on the sales API ([20254b6](https://github.com/reservoirprotocol/indexer/commit/20254b6140c12282e2365fcdc8b5e6e6f124c030))
* basic support for zeroex-v4/opendao ([720131d](https://github.com/reservoirprotocol/indexer/commit/720131ddb662a33a1022f1a2e77915a9bd52eb2b))
* basic support for zeroex-v4/opendao ([#258](https://github.com/reservoirprotocol/indexer/issues/258)) ([f06065c](https://github.com/reservoirprotocol/indexer/commit/f06065c8d87faa4d76519a033631e7bb7bb323e7))
* continuation string in base64 ([5dce516](https://github.com/reservoirprotocol/indexer/commit/5dce516619a76fe3e243b6618508e9837ef0d751))
* don't mix collections when refreshing data ([9862523](https://github.com/reservoirprotocol/indexer/commit/98625238ebf4740004640ea9c9342eb38464aca5))
* get source from DB ([af1de82](https://github.com/reservoirprotocol/indexer/commit/af1de8245c2220074bfb3dca30227ee2dd8130cd))
* handle approval changes for looksrare orders ([9206f28](https://github.com/reservoirprotocol/indexer/commit/9206f28b87676a4ef9e95513c2925977f6e07374))
* handle partial filling ([c0f6062](https://github.com/reservoirprotocol/indexer/commit/c0f6062b8b0b37a70af3863a2a3ab0ced1f1555d))
* integrate cancelling looksrare orders ([04e89cb](https://github.com/reservoirprotocol/indexer/commit/04e89cb3b8e9244c73ddfb6ff7f293e96e8e2d04))
* integrate collection royalties into looksrare orders ([54093e3](https://github.com/reservoirprotocol/indexer/commit/54093e3f804a6695b416143cf89f559537121921))
* integrate looksrare ([22779a7](https://github.com/reservoirprotocol/indexer/commit/22779a71e3da9080aa4b89f4bf5a31440162813f))
* new metadata refresh queue ([c6c9971](https://github.com/reservoirprotocol/indexer/commit/c6c9971a09d50bd982b77143650e12cf0765cc51))
* new metadata refresh queue ([dfd5263](https://github.com/reservoirprotocol/indexer/commit/dfd526337bcba669e6cebf56e4901ab0c3b0090e))
* optionally check buy order approvals on-chain ([fb16a81](https://github.com/reservoirprotocol/indexer/commit/fb16a81a544b011c017f0abce8aa36227b2cc945))
* support bidding via 721ex ([2fa2f0c](https://github.com/reservoirprotocol/indexer/commit/2fa2f0c6861861d6cc2d2fbd32571e7f2795f20d))
* support cancelling and filling looksrare orders ([b70eecd](https://github.com/reservoirprotocol/indexer/commit/b70eecdab5f64ca9dbd3a76f7f8b320ec08c2db3))
* support filling opendao orders ([9d0b4cb](https://github.com/reservoirprotocol/indexer/commit/9d0b4cbf1449875808d0e4f75b8308ba972989cf))
* support listing 721ex orders ([5e5ba54](https://github.com/reservoirprotocol/indexer/commit/5e5ba5478915a42dd757e01e01a60420e15d39c4))
* support multiple tokens in token/tokens details ([5c5120a](https://github.com/reservoirprotocol/indexer/commit/5c5120acb9404625a2d6ab9ba373eb2a632345ee))
* temporary log keys when posting orders in batch ([cf06e4c](https://github.com/reservoirprotocol/indexer/commit/cf06e4c321c2de9031d604d85bb585e67791eeab))



# [5.15.0](https://github.com/reservoirprotocol/indexer/compare/v5.14.4...v5.15.0) (2022-04-07)


### Features

* update queue export ([46d1c52](https://github.com/reservoirprotocol/indexer/commit/46d1c52dafeefedd864599bc3240ce6269391801))



## [5.14.4](https://github.com/reservoirprotocol/indexer/compare/v5.14.3...v5.14.4) (2022-04-07)


### Features

* added log ([e270bf2](https://github.com/reservoirprotocol/indexer/commit/e270bf2d76c937b10619bc03cd9e6c6bb097bcff))
* added log ([5237078](https://github.com/reservoirprotocol/indexer/commit/52370784bda3ea4440c6cf52b8b9a26aab3a1f1f))
* added log ([95e8525](https://github.com/reservoirprotocol/indexer/commit/95e85254cb94998a192792da7cedd41e057291d9))
* added logs ([ea236ec](https://github.com/reservoirprotocol/indexer/commit/ea236ec0d090e66e820324eaa1aba12539412029))
* added logs ([e29e6b6](https://github.com/reservoirprotocol/indexer/commit/e29e6b6a1758038d5db2f7ffd9123aafaacd27ec))
* added logs ([dc56bfb](https://github.com/reservoirprotocol/indexer/commit/dc56bfb7ee5f15f4aaa858d239a4694395443a50))
* check for valid return ([8f50e2d](https://github.com/reservoirprotocol/indexer/commit/8f50e2d7f66a3d403ba2f09e87d68483c412a6ed))
* fix chars case ([84d6abf](https://github.com/reservoirprotocol/indexer/commit/84d6abf77bd91be48e684f1aee586eb88c722e5b))
* fix migration ([405fb4f](https://github.com/reservoirprotocol/indexer/commit/405fb4f771d30fe32845a9fd3ec52e82863bd352))
* fix query ([1bbe0ef](https://github.com/reservoirprotocol/indexer/commit/1bbe0ef330747d7f9f2e2101d4d53022981243c4))
* fix update condition ([0ace108](https://github.com/reservoirprotocol/indexer/commit/0ace108474f452fb27f775f17f84fb0ac892149b))
* handle buy orders ([2f382d6](https://github.com/reservoirprotocol/indexer/commit/2f382d654a0b89222286d192797fd94188323c3f))
* recalculate floor sell value ([74414ab](https://github.com/reservoirprotocol/indexer/commit/74414ab9e01521eba11512ae5ccc1032cc1ed31b))
* sync on sales count ([6cd76ba](https://github.com/reservoirprotocol/indexer/commit/6cd76ba4a24196e08789e8b31b80392bfce6c82c))
* update attributes cache ([6aaeb94](https://github.com/reservoirprotocol/indexer/commit/6aaeb94722f4eb9deda9af9fcb73b4a1a0d8960a))
* update attributes cache ([10d38ec](https://github.com/reservoirprotocol/indexer/commit/10d38ec5227d8ddd7bb86a0a77cb365c43e3640e))
* update attributes cache ([cb5ac2f](https://github.com/reservoirprotocol/indexer/commit/cb5ac2fd921c13f2e977f3e8fc6a3f272926dba4))
* update logs ([c0638b4](https://github.com/reservoirprotocol/indexer/commit/c0638b4d9e387afe710346f94d8d2d418b85bbbf))
* update logs ([9c5cab4](https://github.com/reservoirprotocol/indexer/commit/9c5cab4bd3d23fcf934b5fe9685098ef26d7807a))
* wip ([b547a82](https://github.com/reservoirprotocol/indexer/commit/b547a82d8c40b1850eedeb5c7e59e2e453214282))
* wip ([12bfbce](https://github.com/reservoirprotocol/indexer/commit/12bfbce71654f650e31048e432ce2bda426caf0d))
* wip ([f322e52](https://github.com/reservoirprotocol/indexer/commit/f322e52b9bbafc7078a62614865c5d0f530792bb))
* wip ([eb9be42](https://github.com/reservoirprotocol/indexer/commit/eb9be42ee9536465271a3d912f4a82c5609158f0))
* wip ([0b967b7](https://github.com/reservoirprotocol/indexer/commit/0b967b76de4a6b0aa97f099b2e30bf27fb5c712c))



## [5.14.3](https://github.com/reservoirprotocol/indexer/compare/v5.14.2...v5.14.3) (2022-04-07)


### Bug Fixes

* update collection royalties on refresh ([77d21a2](https://github.com/reservoirprotocol/indexer/commit/77d21a2965ca2d49316086fea26c3c379209c980))



## [5.14.2](https://github.com/reservoirprotocol/indexer/compare/v5.14.1...v5.14.2) (2022-04-07)


### Bug Fixes

* only support a single continuation format ([236cba8](https://github.com/reservoirprotocol/indexer/commit/236cba84a85c1caaf6c33478d12e53b33215bdd7))



## [5.14.1](https://github.com/reservoirprotocol/indexer/compare/v5.14.0...v5.14.1) (2022-04-07)


### Bug Fixes

* use proper min nonce for wyvern v2.3 ([593b5f4](https://github.com/reservoirprotocol/indexer/commit/593b5f490dbbf18327900f270470f3bb5d2e2322))



# [5.14.0](https://github.com/reservoirprotocol/indexer/compare/v5.13.1...v5.14.0) (2022-04-07)


### Features

* fix log ([7087a2f](https://github.com/reservoirprotocol/indexer/commit/7087a2f5342ee925ddbe03f9b6b98cb354c2f42f))



## [5.13.1](https://github.com/reservoirprotocol/indexer/compare/v5.13.0...v5.13.1) (2022-04-07)


### Features

* fix if condition ([e1d71d2](https://github.com/reservoirprotocol/indexer/commit/e1d71d23e84e953648ad23a6472749b82dcb4414))



# [5.13.0](https://github.com/reservoirprotocol/indexer/compare/v5.12.1...v5.13.0) (2022-04-07)


### Features

* added logs ([f88a28c](https://github.com/reservoirprotocol/indexer/commit/f88a28cbf00b01150ebd9646582dd18b3a0755b7))



## [5.12.1](https://github.com/reservoirprotocol/indexer/compare/v5.12.0...v5.12.1) (2022-04-06)



# [5.12.0](https://github.com/reservoirprotocol/indexer/compare/v5.11.1...v5.12.0) (2022-04-06)


### Features

* add 5s cache to tokens floor route ([ae4a173](https://github.com/reservoirprotocol/indexer/commit/ae4a17390c5cbea7f36b78ea87e72b058f7757f4))



## [5.11.1](https://github.com/reservoirprotocol/indexer/compare/v5.11.0...v5.11.1) (2022-04-06)


### Features

* wip ([9cf5192](https://github.com/reservoirprotocol/indexer/commit/9cf51923368c3b09a095597502e71f6aafa6727c))



# [5.11.0](https://github.com/reservoirprotocol/indexer/compare/v5.10.0...v5.11.0) (2022-04-06)


### Features

* wip ([990be72](https://github.com/reservoirprotocol/indexer/commit/990be7298c2b5e4477c9d596b3ff6c36abc19848))



# [5.10.0](https://github.com/reservoirprotocol/indexer/compare/v5.9.2...v5.10.0) (2022-04-06)


### Features

* wip ([0962345](https://github.com/reservoirprotocol/indexer/commit/096234577e52ffd5937dfdc061f0c43db8204039))



## [5.9.2](https://github.com/reservoirprotocol/indexer/compare/v5.9.1...v5.9.2) (2022-04-06)


### Features

* remove use of promise ([a9a01e4](https://github.com/reservoirprotocol/indexer/commit/a9a01e4aa686861dcb002e1d20a9ec42e9730cce))



## [5.9.1](https://github.com/reservoirprotocol/indexer/compare/v5.9.0...v5.9.1) (2022-04-06)


### Features

* cache sources and enable source fetching on v1 ([30c7910](https://github.com/reservoirprotocol/indexer/commit/30c7910a8f1bc49c6cfabd4dd9a61c8891fe4a46))



# [5.9.0](https://github.com/reservoirprotocol/indexer/compare/v5.8.2...v5.9.0) (2022-04-05)


### Features

* remove source from details v1 ([b7cf2fc](https://github.com/reservoirprotocol/indexer/commit/b7cf2fc0d9b4c63e09889cc8a4b37184556b5723))



## [5.8.2](https://github.com/reservoirprotocol/indexer/compare/v5.8.1...v5.8.2) (2022-04-05)


### Bug Fixes

* pass nonce value when filling wyvern v2.3 orders ([dc65a02](https://github.com/reservoirprotocol/indexer/commit/dc65a021b9e025c2b743da4c2746437f81f31773))



## [5.8.1](https://github.com/reservoirprotocol/indexer/compare/v5.8.0...v5.8.1) (2022-04-05)


### Bug Fixes

* return collections with more volume first when filtering by slug ([54d5320](https://github.com/reservoirprotocol/indexer/commit/54d5320f1f69f4cea91401ec8e52bcee3e54bb53))



# [5.8.0](https://github.com/reservoirprotocol/indexer/compare/v5.7.4...v5.8.0) (2022-04-05)


### Features

* allow to update sources ([c5753b2](https://github.com/reservoirprotocol/indexer/commit/c5753b230218bb7fb25d25e14033bd80cc32bca7))



## [5.7.4](https://github.com/reservoirprotocol/indexer/compare/v5.7.3...v5.7.4) (2022-04-05)


### Features

* sync sources on each server start ([754f882](https://github.com/reservoirprotocol/indexer/commit/754f882f19688e0f6ae8a2330041bfef7ebb49eb))



## [5.7.3](https://github.com/reservoirprotocol/indexer/compare/v5.7.2...v5.7.3) (2022-04-05)


### Features

* added new api to set community for collection ([7582b58](https://github.com/reservoirprotocol/indexer/commit/7582b58ab87a82094fba0466097df9b27a73e651))



## [5.7.2](https://github.com/reservoirprotocol/indexer/compare/v5.7.1...v5.7.2) (2022-04-05)


### Features

* add metadata and source information to asks and bids api ([4d8ffde](https://github.com/reservoirprotocol/indexer/commit/4d8ffde5b8a7eb1f0d85e2bc7bd2b6662c15163c))



## [5.7.1](https://github.com/reservoirprotocol/indexer/compare/v5.7.0...v5.7.1) (2022-04-05)



# [5.7.0](https://github.com/reservoirprotocol/indexer/compare/v5.6.2...v5.7.0) (2022-04-05)


### Features

* allow up to 500 owners ([92c2235](https://github.com/reservoirprotocol/indexer/commit/92c2235e1b1c88180e950e4d488437aeb2a3b453))



## [5.6.2](https://github.com/reservoirprotocol/indexer/compare/v5.6.1...v5.6.2) (2022-04-04)



## [5.6.1](https://github.com/reservoirprotocol/indexer/compare/v5.6.0...v5.6.1) (2022-04-04)


### Bug Fixes

* allow empty collection metadata entries ([fed892d](https://github.com/reservoirprotocol/indexer/commit/fed892d42cdf3e85ddc2ed0c813001e7c12e6bee))



# [5.6.0](https://github.com/reservoirprotocol/indexer/compare/v5.5.3...v5.6.0) (2022-04-04)


### Features

* use opensea for metadata ([42b5dd4](https://github.com/reservoirprotocol/indexer/commit/42b5dd4fba0f4f1e71b5f5d1d72c9bd7c09d611d))



## [5.5.3](https://github.com/reservoirprotocol/indexer/compare/v5.5.2...v5.5.3) (2022-04-04)



## [5.5.2](https://github.com/reservoirprotocol/indexer/compare/v5.5.1...v5.5.2) (2022-04-02)


### Bug Fixes

* allow getting up to 50 tokens by id ([42ef098](https://github.com/reservoirprotocol/indexer/commit/42ef098ec0280132bd4f51817a99948b6f5313bc))



## [5.5.1](https://github.com/reservoirprotocol/indexer/compare/v5.5.0...v5.5.1) (2022-04-02)


### Features

* enable queue ([f890bde](https://github.com/reservoirprotocol/indexer/commit/f890bde983a90220d9df332b8012b3cabf9a4677))



# [5.5.0](https://github.com/reservoirprotocol/indexer/compare/v5.4.0...v5.5.0) (2022-04-02)


### Features

* disable queue ([bfd04ce](https://github.com/reservoirprotocol/indexer/commit/bfd04ce850e4439bfb0ae297b142b0cb4f8669cd))



# [5.4.0](https://github.com/reservoirprotocol/indexer/compare/v5.3.3...v5.4.0) (2022-04-02)


### Features

* don't mix collections when refreshing data ([#254](https://github.com/reservoirprotocol/indexer/issues/254)) ([e7ec960](https://github.com/reservoirprotocol/indexer/commit/e7ec960101bcbdeca0ebe5100f355f2a7fa137a8))



## [5.3.3](https://github.com/reservoirprotocol/indexer/compare/v5.3.2...v5.3.3) (2022-04-01)


### Bug Fixes

* check token result ([d00118a](https://github.com/reservoirprotocol/indexer/commit/d00118a445693130fca791e6c58340cc7ca9a8b7))



## [5.3.2](https://github.com/reservoirprotocol/indexer/compare/v5.3.1...v5.3.2) (2022-04-01)



## [5.3.1](https://github.com/reservoirprotocol/indexer/compare/v5.3.0...v5.3.1) (2022-03-31)


### Bug Fixes

* add missing looksrare event data ([3f717d9](https://github.com/reservoirprotocol/indexer/commit/3f717d9ee1d514816d43a7d76b06aeeeddb5adea))
* change order kind for looks rare bulk cancel events ([4a2b3e8](https://github.com/reservoirprotocol/indexer/commit/4a2b3e87519a90894cebd03ac2320f14393de556))
* contination bug ([4617baf](https://github.com/reservoirprotocol/indexer/commit/4617baf9a04f7b9696ab7fdececda2ac2f8ffea1))
* repair build ([cad2683](https://github.com/reservoirprotocol/indexer/commit/cad268389439e95c3677504046c17b3b3f9d4255))
* stringify price from looksrare events ([e326c87](https://github.com/reservoirprotocol/indexer/commit/e326c8715e460496526d43a3ef7cd559028efed1))


### Features

* continuation string in base64 ([4ae483d](https://github.com/reservoirprotocol/indexer/commit/4ae483dc5363c137042c6f8213aa62ac1c073c79))
* handle approval changes for looksrare orders ([9160c36](https://github.com/reservoirprotocol/indexer/commit/9160c369627c92277cc39d9e8434179e3bf1238d))
* integrate cancelling looksrare orders ([683004c](https://github.com/reservoirprotocol/indexer/commit/683004ceb16c5c90c0bd4415dc411d2313720cdb))
* integrate collection royalties into looksrare orders ([2216a0e](https://github.com/reservoirprotocol/indexer/commit/2216a0e2db90db35963254fb4db1e6a4d373c0aa))
* integrate looksrare ([d778846](https://github.com/reservoirprotocol/indexer/commit/d778846258285b06253bee9ad38639c19b41edee))
* new metadata refresh queue ([3aa4d26](https://github.com/reservoirprotocol/indexer/commit/3aa4d26364262f6f3760c43ef4811d6be3fda3b1))
* new metadata refresh queue ([bfe8ea1](https://github.com/reservoirprotocol/indexer/commit/bfe8ea104874f3f2724589fbde69c30fefa7c72e))
* support cancelling and filling looksrare orders ([99b2b59](https://github.com/reservoirprotocol/indexer/commit/99b2b599ef42f1762c00f22a14794fc22f87fa25))
* temporary log keys when posting orders in batch ([d424b48](https://github.com/reservoirprotocol/indexer/commit/d424b48de257965d8711a0072a2338e2a335502c))



# [5.3.0](https://github.com/reservoirprotocol/indexer/compare/v5.2.1...v5.3.0) (2022-03-31)


### Features

* support multiple tokens in token/tokens details ([#253](https://github.com/reservoirprotocol/indexer/issues/253)) ([9c0219f](https://github.com/reservoirprotocol/indexer/commit/9c0219fb3b05bb5aad65a9231741bbec30b37d59))



## [5.2.1](https://github.com/reservoirprotocol/indexer/compare/v5.2.0...v5.2.1) (2022-03-29)


### Bug Fixes

* user tokens artblocks ([11cf0f3](https://github.com/reservoirprotocol/indexer/commit/11cf0f3490008ba32e26b95efe262be2c352780e))



# [5.2.0](https://github.com/reservoirprotocol/indexer/compare/v5.1.2...v5.2.0) (2022-03-29)


### Features

* better documentation ([#247](https://github.com/reservoirprotocol/indexer/issues/247)) ([095d705](https://github.com/reservoirprotocol/indexer/commit/095d705055596a559900421314829028e0421cf8))



## [5.1.2](https://github.com/reservoirprotocol/indexer/compare/v5.1.1...v5.1.2) (2022-03-29)



## [5.1.1](https://github.com/reservoirprotocol/indexer/compare/04fb8f81f804d9639642a423511ad3fd3e7043ed...v5.1.1) (2022-03-29)


### Bug Fixes

* add 2 minutes timeout when indexing metadata ([9912656](https://github.com/reservoirprotocol/indexer/commit/99126568a7b80465cd0bfa54a60bf6d26acfc1b3))
* add missing comma ([da5364c](https://github.com/reservoirprotocol/indexer/commit/da5364c84cd4b5989cae66c353aa11cb5e6728b0))
* add missing parameters when posting to opensea ([fc7dcfb](https://github.com/reservoirprotocol/indexer/commit/fc7dcfb6ce6d7c5c27fd03d6fd30beeb1f43b5b5))
* added push to github actions ([4e3ad68](https://github.com/reservoirprotocol/indexer/commit/4e3ad68c7095d988173d4d7116cfd11d26393130))
* adding comitter ([7e38884](https://github.com/reservoirprotocol/indexer/commit/7e3888439befb6b01b4adff500fe788251b748be))
* allow duplicated token metadata write jobs ([8622278](https://github.com/reservoirprotocol/indexer/commit/8622278a07c318b1d509fc30754770193bc82a2a))
* asks and bids apis tweaks ([08a7518](https://github.com/reservoirprotocol/indexer/commit/08a7518df5ddcda508166175b1cfc50473c0e190))
* attribute explore api should sort desc ([70767fb](https://github.com/reservoirprotocol/indexer/commit/70767fbdfbe6ec146cce1b676be76dfee1130fbd))
* change hstore attributes insertion ([5ceda73](https://github.com/reservoirprotocol/indexer/commit/5ceda73c648301febcee43f89a1835e157a7677c))
* change hstore attributes insertion ([d7e45a6](https://github.com/reservoirprotocol/indexer/commit/d7e45a6b07e249164f68d6281e600dbf42e34b65))
* change stats query when filtering by attribute ([b13d4df](https://github.com/reservoirprotocol/indexer/commit/b13d4df72cc45d8317d4f9d07d9e69feb33d0603))
* change to floorAskPrice ([c612798](https://github.com/reservoirprotocol/indexer/commit/c6127981af71ac579eedda463893f43fa6995efc))
* change versions and clean up some code ([077e97f](https://github.com/reservoirprotocol/indexer/commit/077e97fb5e827e5a622fc786e6ebe516cfc5b91e))
* collection entity parsing ([9d31365](https://github.com/reservoirprotocol/indexer/commit/9d313655f2345d7ceb244dd0b92f54454d381b0e))
* contination bug ([#243](https://github.com/reservoirprotocol/indexer/issues/243)) ([f0c5d53](https://github.com/reservoirprotocol/indexer/commit/f0c5d53be623a6a9493a9491db72d6c2cb2c3b51))
* debug ([5173eab](https://github.com/reservoirprotocol/indexer/commit/5173eab03c6dfb250c3c8edf22ac97c3664857e0))
* debug opensea order posting on rinkeby ([ab33d1e](https://github.com/reservoirprotocol/indexer/commit/ab33d1e3065a4529c85010d28793cc931848856b))
* debug rarible full collection indexing ([956f659](https://github.com/reservoirprotocol/indexer/commit/956f659ae899f6959bcaeaa236cd85b5a7fc989d))
* debugging ([c30a9a4](https://github.com/reservoirprotocol/indexer/commit/c30a9a4eb64f0f7eb8a74f7a54b9adbce484f0db))
* debugging ([841ceef](https://github.com/reservoirprotocol/indexer/commit/841ceef559ada0a7777a73f039196fc71b3cba25))
* debugging ([af6eccc](https://github.com/reservoirprotocol/indexer/commit/af6eccc3c5ce91e8564bca8bbf9ab972cdf7a04c))
* debugging ([995fed7](https://github.com/reservoirprotocol/indexer/commit/995fed7f2a6af143c8f03b35984a19a9de8bc7cd))
* default start and end timestamp of the floor ask events api in the code ([f73b033](https://github.com/reservoirprotocol/indexer/commit/f73b0336ba068b1879d53e0943a5f7a523cdfdf7))
* deploy ([dc911ed](https://github.com/reservoirprotocol/indexer/commit/dc911ed73b102fd784a91536cb37af5a3390d520))
* deploy ([18f4ba4](https://github.com/reservoirprotocol/indexer/commit/18f4ba417ddd4e56710a4772120afd73f9c34fcb))
* deploy ([bad4757](https://github.com/reservoirprotocol/indexer/commit/bad4757737e08bd81707c1cd2d0286388c5b2c22))
* deploy ([5cafdbc](https://github.com/reservoirprotocol/indexer/commit/5cafdbc9c1bd6751a7d63d942ed4177c067fb732))
* deploy ([2c8b781](https://github.com/reservoirprotocol/indexer/commit/2c8b78131b1dbff52a058659a831074d9bd76b08))
* do not return any values from query ([c3a2e67](https://github.com/reservoirprotocol/indexer/commit/c3a2e67ea36449a85fbdc68de529f23be3ead635))
* do not return any values from query ([1bc5715](https://github.com/reservoirprotocol/indexer/commit/1bc5715baeec6baf3c57c64de28d2ff30dd1fc59))
* enforce passing the collection together with the attributes ([7e262b6](https://github.com/reservoirprotocol/indexer/commit/7e262b6515dbe11446fada027d44688e7327d73d))
* ensure a single worker fetches metadata ([7590473](https://github.com/reservoirprotocol/indexer/commit/75904738571cdf82c70d06066e24b649998a44ff))
* explicit cast to postgres numeric type ([7fb5573](https://github.com/reservoirprotocol/indexer/commit/7fb557365147f1ce079864f9d649eaae37614cfd))
* github actions ([6c84f8c](https://github.com/reservoirprotocol/indexer/commit/6c84f8c78db8eef919c32fb33c972c020846f2c9))
* github actions ([a1f057d](https://github.com/reservoirprotocol/indexer/commit/a1f057db7694bbe4719e920b96dea00889111170))
* handle duplicated collection slugs ([315adb7](https://github.com/reservoirprotocol/indexer/commit/315adb74620e26af0457c254fb419f76da972db5))
* handle duplicated collection slugs ([60f5331](https://github.com/reservoirprotocol/indexer/commit/60f5331b46700d03dbd236272cfc1837e96d0a67))
* handle pre-approvals of common exchanges ([6dd7e48](https://github.com/reservoirprotocol/indexer/commit/6dd7e4881f27c9823f04833e6dc3c47f3569d435))
* increase metadata fetch concurrency ([6aa4a29](https://github.com/reservoirprotocol/indexer/commit/6aa4a29ea79edfbf8314ba28ca54cbd1636bd9fc))
* increase metadata fetch timeout ([ac677c8](https://github.com/reservoirprotocol/indexer/commit/ac677c87ecd6fd47017e5b193bf6c4bafae6f5cb))
* increase payload size limit for admin metadata index api ([687f2a6](https://github.com/reservoirprotocol/indexer/commit/687f2a6f465c8013caf4fddf48719d9cc9f5d27b))
* insert newly minted tokens into corresponding collection-wide token sets ([d7d29e3](https://github.com/reservoirprotocol/indexer/commit/d7d29e3e2757ec034098439367c75b2cc815c6d8))
* make the owner nullable in the tokens details api ([9d3aa0e](https://github.com/reservoirprotocol/indexer/commit/9d3aa0e7c6e333e13277fc19e64f3b554c282fb8))
* optimize get user collections api ([b77e6fa](https://github.com/reservoirprotocol/indexer/commit/b77e6fa5ec9f5fc77d47ee4a6ab570a830063718))
* orders asks and bids api tweaks ([f3644a4](https://github.com/reservoirprotocol/indexer/commit/f3644a4d0cf683f262105ef0d19763f87e82a079))
* proper token set top buy query ([75457ff](https://github.com/reservoirprotocol/indexer/commit/75457fff8766b534eaa3e8798d16a955853458ae))
* proper wyvern payment token detection ([e80d2ec](https://github.com/reservoirprotocol/indexer/commit/e80d2ec5ec6d0c70e8b7b46a06973ea5e8bfb96c))
* properly handle attribute filtering on collection attributes apis ([0e011a4](https://github.com/reservoirprotocol/indexer/commit/0e011a4bc3439476a88515abbd27adef0699f92b))
* properly handle attribute filtering on collection attributes apis ([082516f](https://github.com/reservoirprotocol/indexer/commit/082516ffaf3347549bc1492a39dedbdd541c27c3))
* properly handle inactive orders retrieval ([5e2a942](https://github.com/reservoirprotocol/indexer/commit/5e2a94225dca225030fe1c649fada02ecbf302de))
* properly handle list token sets ([4bb8164](https://github.com/reservoirprotocol/indexer/commit/4bb81646637167a696a4607778f1cc7603012ecc))
* properly handle list token sets with attributes ([4674d84](https://github.com/reservoirprotocol/indexer/commit/4674d844674b535c8597c02f03f2fa3789c80fe3))
* properly handle retrieving null sources ([1187c36](https://github.com/reservoirprotocol/indexer/commit/1187c36a116383b8ef57d934154f917332f4e218))
* redeploy ([6dcdfc8](https://github.com/reservoirprotocol/indexer/commit/6dcdfc82b1804b90e4a0f34a0b7dfac6ebe88255))
* remove concurrency from metadata write queue ([7cfc037](https://github.com/reservoirprotocol/indexer/commit/7cfc03726dcfdc6fbe224d415c72bbdf9be86d39))
* remove debug log ([2904e78](https://github.com/reservoirprotocol/indexer/commit/2904e782c8a6252fda1fc360e2bd242e20d33521))
* remove debug log ([41ffb97](https://github.com/reservoirprotocol/indexer/commit/41ffb977ce9ad80d1cc81d29f24296a800fd1c84))
* remove debug logs ([de32984](https://github.com/reservoirprotocol/indexer/commit/de32984ee4cb53bf2ef94d9245d26b10a70871a0))
* remove initial token attributes deletion and increase concurrency ([e68a441](https://github.com/reservoirprotocol/indexer/commit/e68a441c8adb3096925a79c730a542ccf064ccd3))
* remove join on tokens when fetching collections ([04fb8f8](https://github.com/reservoirprotocol/indexer/commit/04fb8f81f804d9639642a423511ad3fd3e7043ed))
* remove token attributes deletion ([4556b08](https://github.com/reservoirprotocol/indexer/commit/4556b08ad29094d1787f5034bcb9163e1f1703d8))
* repair build ([e6e0b56](https://github.com/reservoirprotocol/indexer/commit/e6e0b56b89536497508a0c6ae2fdc013790acb88))
* revert temporary timeout increase and add improvement idea for updating expired orders ([370dfe0](https://github.com/reservoirprotocol/indexer/commit/370dfe01dda87d36ccc50fa4a3c89bb28b7e7154))
* skip metadata for unknown tokens ([5fe9946](https://github.com/reservoirprotocol/indexer/commit/5fe9946339de2c96841502f38faef39c3b523102))
* skip metadata write jobs with invalid data ([972afba](https://github.com/reservoirprotocol/indexer/commit/972afba0f803e1cd74f0ffb2af061e1624d8518e))
* skip unknown collections ([73ea6a9](https://github.com/reservoirprotocol/indexer/commit/73ea6a97ca693a6416f157ec993699ecab96af78))
* stringify all metadata keys and values before inserting to database ([9006f09](https://github.com/reservoirprotocol/indexer/commit/9006f0948338a8c23f4405832cf95227f331d4bb))
* temporary internal database timeouts increase ([16e3c86](https://github.com/reservoirprotocol/indexer/commit/16e3c8650f9f24403c4b16fa897b145c77a0ba07))
* temporary script for backfilling all orders' contract ([276128c](https://github.com/reservoirprotocol/indexer/commit/276128cf9b70c53728faf3b31fa3d5c85eba41cb))
* testing ([6920c1d](https://github.com/reservoirprotocol/indexer/commit/6920c1d7c2b094b7f524299f1e567dd4a38491f0))
* top sell value from users tokens ([5e159bd](https://github.com/reservoirprotocol/indexer/commit/5e159bd8687d854d342da8e77702537796bf4a08))
* transfer continuation node ([f3a1656](https://github.com/reservoirprotocol/indexer/commit/f3a1656d5299bbfc4e84bcbb8253cb17afd3c5f9))
* tweak attributes all api ([7ed8f06](https://github.com/reservoirprotocol/indexer/commit/7ed8f06a41b2ef6b5b8ce8849af6be56c9b960f7))
* tweak attributes all api ([d6ed9e9](https://github.com/reservoirprotocol/indexer/commit/d6ed9e9b19fc41471b0446e10d1c11665673d68b))
* tweak collection and stats apis ([bb515fe](https://github.com/reservoirprotocol/indexer/commit/bb515fed45ed7a486240d29eed01bcddff12218a))
* tweak collection and stats apis ([889c775](https://github.com/reservoirprotocol/indexer/commit/889c775624d0167980ddb9775557bb1a24547f4a))
* tweaks to the sales and transfers apis ([db520bc](https://github.com/reservoirprotocol/indexer/commit/db520bcf0d21727c9579e5a13621f217249c37e4))
* update api response ([e61206a](https://github.com/reservoirprotocol/indexer/commit/e61206a65d8c4dac5dcbedb76dede7baab1f37cb))
* update collection name ([4861d4d](https://github.com/reservoirprotocol/indexer/commit/4861d4d5747661ab596995827d96106f8f3f2e5d))
* update metadata index api query ([469d4c0](https://github.com/reservoirprotocol/indexer/commit/469d4c0653d3b36a2d515950e29fa0da21ef3c14))
* update migration indexes ([25aa845](https://github.com/reservoirprotocol/indexer/commit/25aa845a1a7cda46ca8ced665c7a698cf5161600))
* use nulls last when sorting collections by volume ([e0b7e8c](https://github.com/reservoirprotocol/indexer/commit/e0b7e8cf9ed2403d30cf0834007aac8dd78a3d2d))
* user collections response type ([b5db3ad](https://github.com/reservoirprotocol/indexer/commit/b5db3ad4e320449a6574d1b0bae57e004cc5c86a))


### Features

* add admin api for fixing orphaned blocks ([19670cb](https://github.com/reservoirprotocol/indexer/commit/19670cb2129f8e71193542489698a9a295d35783))
* add attributes static api ([3cc7c61](https://github.com/reservoirprotocol/indexer/commit/3cc7c61cda2ccdf690062c01c51f775e9190b966))
* add back initial token attributes deletion ([75a0e8c](https://github.com/reservoirprotocol/indexer/commit/75a0e8c0df87a2c4be23b2b735aceb8619cf31d6))
* add better index on orders ([ba4d085](https://github.com/reservoirprotocol/indexer/commit/ba4d085c5a5b6472e8df991073607a36720d66dd))
* add better logs ([8a386b8](https://github.com/reservoirprotocol/indexer/commit/8a386b8bb4feab170ced910f0c0080763b5d69dd))
* add exponential retry on calculate daily volume and more error checking ([#238](https://github.com/reservoirprotocol/indexer/issues/238)) ([72e43cc](https://github.com/reservoirprotocol/indexer/commit/72e43cc38c91dab7fa2541ac5a6f0ffaad33e176))
* add index for bulk sales retrieval ([e5dc33c](https://github.com/reservoirprotocol/indexer/commit/e5dc33ca6127af41c32739973a37763042284a8a))
* add new reprice token floor ask event ([a081592](https://github.com/reservoirprotocol/indexer/commit/a081592a7a96fcb1d1ed80b6ab0fe913fdd9c328))
* add origin to the logs ([b877c41](https://github.com/reservoirprotocol/indexer/commit/b877c41cf3324ba3225d17d6007c8285f6304177))
* add priority to admin metadata sync ([#230](https://github.com/reservoirprotocol/indexer/issues/230)) ([e80636c](https://github.com/reservoirprotocol/indexer/commit/e80636c0bab898f94ecdf3a18a7c0e65ad2a68af))
* add public apis to refresh token and collections metadata ([b6279a9](https://github.com/reservoirprotocol/indexer/commit/b6279a99f1a241f3623554cdb6dd4470fdc31c99))
* add public apis to refresh token and collections metadata ([#233](https://github.com/reservoirprotocol/indexer/issues/233)) ([a2283ba](https://github.com/reservoirprotocol/indexer/commit/a2283baab9c151245121c9b61d3221f891a5a57c))
* add sorting on 7 and 30 day volume and return those values in the collections api ([#226](https://github.com/reservoirprotocol/indexer/issues/226)) ([227415e](https://github.com/reservoirprotocol/indexer/commit/227415e2d78bfe858c532fd13c4d3254700bbc70))
* add sorting on 7 and 30 day volume and return those values in the collections api ([#227](https://github.com/reservoirprotocol/indexer/issues/227)) ([3d74acd](https://github.com/reservoirprotocol/indexer/commit/3d74acddb5a3d0426d1c91ea3faa911263082aed))
* add support for attribute and collection orders ([5f6caf6](https://github.com/reservoirprotocol/indexer/commit/5f6caf64f0383f50301efa376f726acb1d2889a6))
* add support for attributes ([6ea8cc9](https://github.com/reservoirprotocol/indexer/commit/6ea8cc91904b00dad7b0f97d2ad0431d9c7e26ff))
* add support for bulk indexing collections ([6411e55](https://github.com/reservoirprotocol/indexer/commit/6411e5568d0114920fc0a2b3c46fd292981c0d70))
* add support for dynamic orders ([fc0867d](https://github.com/reservoirprotocol/indexer/commit/fc0867dba900c5438c95be026945515b0d705e15))
* add support for filtering by attributes in the tokens details api ([eebb755](https://github.com/reservoirprotocol/indexer/commit/eebb755e17629f43e8924902e66bdf842b04adce))
* add support for filtering by source in the tokens details api ([6842743](https://github.com/reservoirprotocol/indexer/commit/68427438d37554296487591f1451ee284bc391dd))
* add support for filtering sales by attributes ([4932092](https://github.com/reservoirprotocol/indexer/commit/4932092a93c7ce40b3278858521032d9154fcbf4))
* add support for fixing orders by contract ([ae2d0f3](https://github.com/reservoirprotocol/indexer/commit/ae2d0f387278949e88281fc82721760e0c1b0fe9))
* add support for token media ([87d6c18](https://github.com/reservoirprotocol/indexer/commit/87d6c180c9ea1dc5723b064c93451718a462fe38))
* added additional logs ([f16986b](https://github.com/reservoirprotocol/indexer/commit/f16986b686622b586ff52940ec87cea6f4875049))
* added new transfers api to support continuation ([1ae586e](https://github.com/reservoirprotocol/indexer/commit/1ae586e745b811bbb6ec73690c95ffc89138b99a))
* added versioning ([e51604a](https://github.com/reservoirprotocol/indexer/commit/e51604a59c6773f2b7ad69aed739dbc2c267fdf9))
* allow filtering collections api by slug ([427fd03](https://github.com/reservoirprotocol/indexer/commit/427fd03e279c0b4ce2ca158abeecd97bc4b34997))
* allow large limit on attribute explore ([6e18052](https://github.com/reservoirprotocol/indexer/commit/6e18052b66a98ce4c3a6830c5f0ca2a929c608e4))
* attach contract information to orders ([d526cc5](https://github.com/reservoirprotocol/indexer/commit/d526cc5e6569e658fb0aa112422f3c5c80ceffec))
* better attribute filtering support on transfers and sales api ([97f13f7](https://github.com/reservoirprotocol/indexer/commit/97f13f77b2fc0253647e4a1a38035fa5246aa2c4))
* better metadata indexing ([ac3c352](https://github.com/reservoirprotocol/indexer/commit/ac3c352ee9d699452ff2b37037e0370a3ca89c61))
* better paging and removal of offset and limit in tokens APIs ([b1ec204](https://github.com/reservoirprotocol/indexer/commit/b1ec204dda2b3974cba82d9f3069f61f0d658882))
* better support for rarible metadata syncing ([22a2f3c](https://github.com/reservoirprotocol/indexer/commit/22a2f3cf00256e80aaa150cf675f95b3f4800fd4))
* cache attributes in the tokens table ([3bda8c7](https://github.com/reservoirprotocol/indexer/commit/3bda8c7991cb07c29824ad3c7bdb293f079a67e7))
* cache attributes in the tokens table ([1ffa7a7](https://github.com/reservoirprotocol/indexer/commit/1ffa7a7b572cbdf382a2aaa3d97b395495563794))
* compare row instead of using concat ([8c8ca18](https://github.com/reservoirprotocol/indexer/commit/8c8ca1884398b247ef3eb50b70cbe7549a729881))
* created v3 sales api ([dabf412](https://github.com/reservoirprotocol/indexer/commit/dabf4129ecaa185057ed807f62ea451dbf52728d))
* denormalize attributes in the token_attributes table ([00378f5](https://github.com/reservoirprotocol/indexer/commit/00378f51db4e48001d27260a32feedbb84a4b95d))
* faster owners api ([e37db91](https://github.com/reservoirprotocol/indexer/commit/e37db91dbde5501b1977255d4d488c674c3fc284))
* github actions test ([0b640c9](https://github.com/reservoirprotocol/indexer/commit/0b640c99f5e669a3720ecbc12d34e911c1575ee6))
* improve indexes for orders bids and asks ([f68912a](https://github.com/reservoirprotocol/indexer/commit/f68912a61f8f9a2f245ea73e37aa3f2af29b2ef9))
* improved collection apis ([2692086](https://github.com/reservoirprotocol/indexer/commit/2692086a1f94ef0629ee3c833acedbc7db5fe3b1))
* include sample images in the collections api ([7a3f213](https://github.com/reservoirprotocol/indexer/commit/7a3f213450879ce737220b562c5283988b0bf0b3))
* index the metadata of new tokens ([37c662c](https://github.com/reservoirprotocol/indexer/commit/37c662cb03c9a39719801ba0ccfdcca20f597119))
* integrate attributes api ([6217f20](https://github.com/reservoirprotocol/indexer/commit/6217f209dd0840183c8505dacc6e1f66274645a7))
* integrate attributes into token details api ([3b4399e](https://github.com/reservoirprotocol/indexer/commit/3b4399ee1c0702b5f5d0d03ccc7addd7eb3b0f08))
* integrate collection attributes api ([60f4513](https://github.com/reservoirprotocol/indexer/commit/60f4513401136ce1211cf09c435299767d34d361))
* integrate collection filtering in transfers/sales apis ([6e875ef](https://github.com/reservoirprotocol/indexer/commit/6e875ef787d7368f482beb876099e1cc3381bc08))
* integrate execute buy api ([020bc7a](https://github.com/reservoirprotocol/indexer/commit/020bc7ac8c65ae91b118949a98a32b7f4542b1e1))
* integrate execute cancel api ([786eb5c](https://github.com/reservoirprotocol/indexer/commit/786eb5cf7e9ff26e2f8f6d1b72287af032f336d7))
* integrate execute list api ([118e6a5](https://github.com/reservoirprotocol/indexer/commit/118e6a59826181e39e3bb7a5c880512f1f07c5f0))
* integrate execute sell api ([b6192d0](https://github.com/reservoirprotocol/indexer/commit/b6192d0236b206edf829f5bdac42f69097dd74d5))
* integrate filtering by attributes in the owners api ([0eb2b87](https://github.com/reservoirprotocol/indexer/commit/0eb2b877f6e9cd0e3f26ce52b4b1d9323e0fa7ac))
* integrate filtering by contract or source in the orders all api ([616674c](https://github.com/reservoirprotocol/indexer/commit/616674c7281e2e0672897b5a9b100e597285cceb))
* integrate orders asks and bids apis ([ecde810](https://github.com/reservoirprotocol/indexer/commit/ecde810984ecd370e734540ec3d110908cb468af))
* integrate stats api ([b28ddf5](https://github.com/reservoirprotocol/indexer/commit/b28ddf5fb68a09e2890b54a822fe9c4a6c5a19d3))
* integrate user positions api ([d2c28cb](https://github.com/reservoirprotocol/indexer/commit/d2c28cbd8cc52516e33b29fd4e71ed1df174d7ba))
* Log api calls with api keys for reference and set some defaults when no api key/invalid key are used ([37b0870](https://github.com/reservoirprotocol/indexer/commit/37b08709873346353d62d985560394cdc0eafd81))
* optimize attribute filtering ([1d8dc56](https://github.com/reservoirprotocol/indexer/commit/1d8dc56fdbba2097ab028bffea1dfdd1eba28ea0))
* optional time range and sort direction for token floor ask events API ([849e5ad](https://github.com/reservoirprotocol/indexer/commit/849e5ad335d0cfeec0f27ecd8a9a96f09a5809a4))
* prioritize collection sync api ([fb82929](https://github.com/reservoirprotocol/indexer/commit/fb82929db39374c6121a7f77f1162061cc4537be))
* prioritize low fee sell orders ([e93a76c](https://github.com/reservoirprotocol/indexer/commit/e93a76cc39ec45fc9615ce6ce1d9e0fe8a61da58))
* properly associate orders to their source ([02c5c43](https://github.com/reservoirprotocol/indexer/commit/02c5c430c9fe0787c8ac0c43c01c9c416a48c1ed))
* properly integrate metadata for user positions api ([48d1780](https://github.com/reservoirprotocol/indexer/commit/48d178039712fe53cc3805b82c5d2541ecc428ac))
* remove redundant fields ([86a3dda](https://github.com/reservoirprotocol/indexer/commit/86a3dda5c42165c8962a5a55ca16444334d76f26))
* reorganize API into more logical product categories ([30428df](https://github.com/reservoirprotocol/indexer/commit/30428df18b98a153ac296f659a62564bfc48ec19))
* support building attribute and collections bids ([1384638](https://github.com/reservoirprotocol/indexer/commit/138463823af3933bf7f772ddde98a6d9baab3a0f))
* temporary log keys when posting orders in batch ([4ff07d2](https://github.com/reservoirprotocol/indexer/commit/4ff07d20ce008de72a639ab3a95b421be663ee2c))
* update indexes ([696411c](https://github.com/reservoirprotocol/indexer/commit/696411cb419af1fc26d843cfa7f07e2f158b88dc))
* update user tokens api to sort by top_buy_value ([541288b](https://github.com/reservoirprotocol/indexer/commit/541288b7d73e4a44bd64aaded641d1a0109fbbee))
* update x-deprecated docs ([666f235](https://github.com/reservoirprotocol/indexer/commit/666f2354b3732b5c3aaa9964dc0f0e147bfe4df9))
* use a sample image as the collection icon when missing ([a526bed](https://github.com/reservoirprotocol/indexer/commit/a526bed11cecfa21097fe74d864b649410c658fd))
* use cached tokens attributes ([5144ab5](https://github.com/reservoirprotocol/indexer/commit/5144ab55286c8ac14ec1786e64fe37dd5a596abc))
* use continuation node for pagination ([23066a5](https://github.com/reservoirprotocol/indexer/commit/23066a5cbbd4094f70532f16edd52990bab39c2d))
* use denormalized attributes for filtering ([ad68c2b](https://github.com/reservoirprotocol/indexer/commit/ad68c2b33a33756ec39edd52cdcde2bf640b7f9d))
* v2 sales API ([ad41ff1](https://github.com/reservoirprotocol/indexer/commit/ad41ff1f9a3ea1ae611a1a285e3bd3ee09d7a3ad))
* wip ([bdfd689](https://github.com/reservoirprotocol/indexer/commit/bdfd68975bf39cff74004f02625abd04ea2da426))



