# [5.287.0](https://github.com/reservoirprotocol/indexer/compare/v5.286.0...v5.287.0) (2023-03-23)


### Features

* update filed name ([5f55a32](https://github.com/reservoirprotocol/indexer/commit/5f55a322105f4b8c076359cc5dc377a1bdd6d178))

# [5.286.0](https://github.com/reservoirprotocol/indexer/compare/v5.285.0...v5.286.0) (2023-03-23)


### Bug Fixes

* rename redis channel new-top-bid -> top-bids ([1adfde0](https://github.com/reservoirprotocol/indexer/commit/1adfde0b53e4cd98225fda7aee4c06bf60a1c463))


### Features

* add redis pub into websocket event ([25ac16b](https://github.com/reservoirprotocol/indexer/commit/25ac16b19a96cc68ddee8f46cb2b834f516c4f30))
* remove floor changes from this branch ([23899cc](https://github.com/reservoirprotocol/indexer/commit/23899cc370226a05ee75184dff45850c89d2d389))

# [5.285.0](https://github.com/reservoirprotocol/indexer/compare/v5.284.0...v5.285.0) (2023-03-23)


### Features

* decrease sample size from 10k -> 5k for performance ([0db6a9c](https://github.com/reservoirprotocol/indexer/commit/0db6a9c66d2bf05589c3e396e55d539e9ba0d71e))

# [5.284.0](https://github.com/reservoirprotocol/indexer/compare/v5.283.0...v5.284.0) (2023-03-23)


### Features

* added api usage tracking ([4b99959](https://github.com/reservoirprotocol/indexer/commit/4b99959e27c1385fee2005135c3eaafdde223e90))
* added metrics api ([73c49a7](https://github.com/reservoirprotocol/indexer/commit/73c49a78444b5f22f813bc144209ee90cc542029))
* added metrics api ([01ca733](https://github.com/reservoirprotocol/indexer/commit/01ca7339287b2a13e998006ee48008f100714389))
* count only valid http code calls ([2f68395](https://github.com/reservoirprotocol/indexer/commit/2f68395d9f29490c629a7a97ec01afd7b3f27e52))
* get status code if error ([247fc55](https://github.com/reservoirprotocol/indexer/commit/247fc555f5050503f559e78e18f9dd945913a1df))
* merge main ([8682561](https://github.com/reservoirprotocol/indexer/commit/8682561f5d86fd756ae8bf8088a5ada186442219))
* support multiple chains in one metric redis ([51043c1](https://github.com/reservoirprotocol/indexer/commit/51043c19d7fc39593460c328700b8c3c0b960387))
* support multiple chains in one metric redis ([75ed6f8](https://github.com/reservoirprotocol/indexer/commit/75ed6f8ea351d4647b87d9c229b069c366cb090d))
* support passing multiple keys to metrics api ([5fdcec1](https://github.com/reservoirprotocol/indexer/commit/5fdcec1dc3ec0ea2db5ae19d05945fa8ab7f3f96))
* update cron timing ([4c94d2d](https://github.com/reservoirprotocol/indexer/commit/4c94d2d8d71413ee5ec225d8606fa3482e1aa31c))
* update models ([d2a4d0f](https://github.com/reservoirprotocol/indexer/commit/d2a4d0fe39ad6efd38e97a1c4ef90a33df9c3529))
* update yarn ([b08b6af](https://github.com/reservoirprotocol/indexer/commit/b08b6af66d4a24fce766e714d434a925821b1210))
* update yarn ([3f348e3](https://github.com/reservoirprotocol/indexer/commit/3f348e37d6cbc67725d04d1f0cf80e299f295099))

# [5.283.0](https://github.com/reservoirprotocol/indexer/compare/v5.282.0...v5.283.0) (2023-03-23)


### Features

* add support for filtering out EOA-only listings ([d9c38e5](https://github.com/reservoirprotocol/indexer/commit/d9c38e5fae9b07a1fc8282c9bb3b64e3abe184d1))

# [5.282.0](https://github.com/reservoirprotocol/indexer/compare/v5.281.1...v5.282.0) (2023-03-23)


### Features

* keep track of filled order ids by sale item ([a8257a3](https://github.com/reservoirprotocol/indexer/commit/a8257a3dfc75d371edb786a17223e4d728afa585))

## [5.281.1](https://github.com/reservoirprotocol/indexer/compare/v5.281.0...v5.281.1) (2023-03-22)


### Bug Fixes

* leave includeRoyaltiesPaid undefined if token has no last order ([9dcbd2b](https://github.com/reservoirprotocol/indexer/commit/9dcbd2b76515658ac1b325dfc6807f3e10438e2b))

# [5.281.0](https://github.com/reservoirprotocol/indexer/compare/v5.280.4...v5.281.0) (2023-03-22)


### Features

* always log x-api-key ([7114be4](https://github.com/reservoirprotocol/indexer/commit/7114be4ac7744c3c575a49fd08becd0ee0c2fae7))

## [5.280.4](https://github.com/reservoirprotocol/indexer/compare/v5.280.3...v5.280.4) (2023-03-22)


### Bug Fixes

* filter out redundant steps ([821ad29](https://github.com/reservoirprotocol/indexer/commit/821ad29a20d87db7c0f695f5b05754cd120180ce))

## [5.280.3](https://github.com/reservoirprotocol/indexer/compare/v5.280.2...v5.280.3) (2023-03-22)


### Bug Fixes

* trigger version bump ([51a8079](https://github.com/reservoirprotocol/indexer/commit/51a80795af726f6f71beaa9cd5559d33c633aadd))

## [5.280.2](https://github.com/reservoirprotocol/indexer/compare/v5.280.1...v5.280.2) (2023-03-22)


### Bug Fixes

* configure pipeline ([d5b1e5c](https://github.com/reservoirprotocol/indexer/commit/d5b1e5c779eb1bbc6345933d812cc4b9bcd0529c))

## [5.280.1](https://github.com/reservoirprotocol/indexer/compare/v5.280.0...v5.280.1) (2023-03-22)


### Bug Fixes

* remove package-lock.json ([e056e26](https://github.com/reservoirprotocol/indexer/commit/e056e2614b3084fd35dbccc21ab2ba716a9cd7d0))
* semantic-release config ([b0d711b](https://github.com/reservoirprotocol/indexer/commit/b0d711b26cf4ffed2e471eae90e8e25487041dc8))
* semantic-release config ([1aa2455](https://github.com/reservoirprotocol/indexer/commit/1aa2455140ac09e10e17b5ceb3374bc4fc9b455b))

# [5.277.0](https://github.com/reservoirprotocol/indexer/compare/v5.276.1...v5.277.0) (2023-03-22)


### Bug Fixes

* blur sweeping ([f136fc0](https://github.com/reservoirprotocol/indexer/commit/f136fc03f5d661d1eacdb449800960930d22e426))
* cleanup ([67185a2](https://github.com/reservoirprotocol/indexer/commit/67185a288e388e7f65503c132a16471044ec374b))
* early stop for opensea protected offers ([998cccc](https://github.com/reservoirprotocol/indexer/commit/998cccc02dadbd3cc6038418f14da31d13de1b9f))
* ensure WHERE is added when no prior conditions ([92a3a5e](https://github.com/reservoirprotocol/indexer/commit/92a3a5eb3a86afc86df077b881d798a1f7a28891))
* expose blur errors ([36781ef](https://github.com/reservoirprotocol/indexer/commit/36781ef144f38c0d8ec2dbafe63dd6e020ff0f64))
* fix bracket ([fe2de54](https://github.com/reservoirprotocol/indexer/commit/fe2de54c41777235db578a9ce4ba28ba234c15be))
* fix redundant ordering logic ([f4bbc4b](https://github.com/reservoirprotocol/indexer/commit/f4bbc4b6d5cde7021c0cbe444afa99d3ec68dc42))
* fix tokens timeout for large collectionsSetid ([ed2ae75](https://github.com/reservoirprotocol/indexer/commit/ed2ae750ff3b43cc2a780c4f28fb261ed6208265))
* performance improvements on owners/v1 and activity/v5 ([2183507](https://github.com/reservoirprotocol/indexer/commit/21835073f8341b8acb8bb7f07b322f3b0273fc6f))
* properly expose errors in the buy and sell apis ([bec2ee9](https://github.com/reservoirprotocol/indexer/commit/bec2ee9ecbdf8321c050bc92d69320beb7f74f14))
* refactor params ([1d985ce](https://github.com/reservoirprotocol/indexer/commit/1d985ce679c4ef304f865d6478962bf0f52adbeb))
* refactor params ([42a00f8](https://github.com/reservoirprotocol/indexer/commit/42a00f8420cb9a7d69d2021514eafe3bf90b2b99))
* refactor params ([4fefefd](https://github.com/reservoirprotocol/indexer/commit/4fefefde703b18fd651608719c468c4d175f12a2))
* semantic-release config ([e852b64](https://github.com/reservoirprotocol/indexer/commit/e852b645e7a32d22841634431f0914a431b1b6b6))
* specify table for normalized_floor_sell_value when not doing union ([b604ecf](https://github.com/reservoirprotocol/indexer/commit/b604ecfb774ed4fc6b8855ffdf8e933e8d2af144))
* specify table in all cases to avoid ambiguity ([74771a0](https://github.com/reservoirprotocol/indexer/commit/74771a064ca16d84aa5fb547c71888f7bf165b9d))
* variable names ([d156384](https://github.com/reservoirprotocol/indexer/commit/d1563844bd43261760f4675d2c5142e5ed745ea0))


### Features

* add contract to fill event price index ([1a1a31f](https://github.com/reservoirprotocol/indexer/commit/1a1a31f6b17f7316ccef9c5addcc55578cc51822))
* add fill_events_2_contract_price_index to original migration ([e2ad14b](https://github.com/reservoirprotocol/indexer/commit/e2ad14b65194be4a63871a76ed302c27e3eee4a0))
* add price logic for continuation ([733874c](https://github.com/reservoirprotocol/indexer/commit/733874c71507b91c7c5b832056923f850714c222))
* add sale price index migration ([af710ec](https://github.com/reservoirprotocol/indexer/commit/af710eca2f9539ed006f2a6a045d8df7781ab252))
* add sorting by time/price to sales v4 ([f1709fb](https://github.com/reservoirprotocol/indexer/commit/f1709fbeba85d1311804c0ba872e26e87e9a0e73))
* better exposure of filling errors ([b914422](https://github.com/reservoirprotocol/indexer/commit/b9144228d048ecf096522b8a290362ae58c2d98e))
* make the order fetcher service url configurable ([6d62929](https://github.com/reservoirprotocol/indexer/commit/6d62929fd72f851aabd3c2d1a6a2d9b4cd916b29))

# [5.277.0](https://github.com/reservoirprotocol/indexer/compare/v5.276.1...v5.277.0) (2023-03-22)


### Bug Fixes

* cleanup ([67185a2](https://github.com/reservoirprotocol/indexer/commit/67185a288e388e7f65503c132a16471044ec374b))
* early stop for opensea protected offers ([998cccc](https://github.com/reservoirprotocol/indexer/commit/998cccc02dadbd3cc6038418f14da31d13de1b9f))
* ensure WHERE is added when no prior conditions ([92a3a5e](https://github.com/reservoirprotocol/indexer/commit/92a3a5eb3a86afc86df077b881d798a1f7a28891))
* expose blur errors ([36781ef](https://github.com/reservoirprotocol/indexer/commit/36781ef144f38c0d8ec2dbafe63dd6e020ff0f64))
* fix bracket ([fe2de54](https://github.com/reservoirprotocol/indexer/commit/fe2de54c41777235db578a9ce4ba28ba234c15be))
* fix redundant ordering logic ([f4bbc4b](https://github.com/reservoirprotocol/indexer/commit/f4bbc4b6d5cde7021c0cbe444afa99d3ec68dc42))
* fix tokens timeout for large collectionsSetid ([ed2ae75](https://github.com/reservoirprotocol/indexer/commit/ed2ae750ff3b43cc2a780c4f28fb261ed6208265))
* performance improvements on owners/v1 and activity/v5 ([2183507](https://github.com/reservoirprotocol/indexer/commit/21835073f8341b8acb8bb7f07b322f3b0273fc6f))
* properly expose errors in the buy and sell apis ([bec2ee9](https://github.com/reservoirprotocol/indexer/commit/bec2ee9ecbdf8321c050bc92d69320beb7f74f14))
* refactor params ([1d985ce](https://github.com/reservoirprotocol/indexer/commit/1d985ce679c4ef304f865d6478962bf0f52adbeb))
* refactor params ([42a00f8](https://github.com/reservoirprotocol/indexer/commit/42a00f8420cb9a7d69d2021514eafe3bf90b2b99))
* refactor params ([4fefefd](https://github.com/reservoirprotocol/indexer/commit/4fefefde703b18fd651608719c468c4d175f12a2))
* semantic-release config ([e852b64](https://github.com/reservoirprotocol/indexer/commit/e852b645e7a32d22841634431f0914a431b1b6b6))
* specify table for normalized_floor_sell_value when not doing union ([b604ecf](https://github.com/reservoirprotocol/indexer/commit/b604ecfb774ed4fc6b8855ffdf8e933e8d2af144))
* specify table in all cases to avoid ambiguity ([74771a0](https://github.com/reservoirprotocol/indexer/commit/74771a064ca16d84aa5fb547c71888f7bf165b9d))
* variable names ([d156384](https://github.com/reservoirprotocol/indexer/commit/d1563844bd43261760f4675d2c5142e5ed745ea0))


### Features

* add contract to fill event price index ([1a1a31f](https://github.com/reservoirprotocol/indexer/commit/1a1a31f6b17f7316ccef9c5addcc55578cc51822))
* add fill_events_2_contract_price_index to original migration ([e2ad14b](https://github.com/reservoirprotocol/indexer/commit/e2ad14b65194be4a63871a76ed302c27e3eee4a0))
* add price logic for continuation ([733874c](https://github.com/reservoirprotocol/indexer/commit/733874c71507b91c7c5b832056923f850714c222))
* add sale price index migration ([af710ec](https://github.com/reservoirprotocol/indexer/commit/af710eca2f9539ed006f2a6a045d8df7781ab252))
* add sorting by time/price to sales v4 ([f1709fb](https://github.com/reservoirprotocol/indexer/commit/f1709fbeba85d1311804c0ba872e26e87e9a0e73))
* better exposure of filling errors ([b914422](https://github.com/reservoirprotocol/indexer/commit/b9144228d048ecf096522b8a290362ae58c2d98e))
* make the order fetcher service url configurable ([6d62929](https://github.com/reservoirprotocol/indexer/commit/6d62929fd72f851aabd3c2d1a6a2d9b4cd916b29))

# [5.277.0](https://github.com/reservoirprotocol/indexer/compare/v5.276.1...v5.277.0) (2023-03-21)


### Bug Fixes

* cleanup ([67185a2](https://github.com/reservoirprotocol/indexer/commit/67185a288e388e7f65503c132a16471044ec374b))
* early stop for opensea protected offers ([998cccc](https://github.com/reservoirprotocol/indexer/commit/998cccc02dadbd3cc6038418f14da31d13de1b9f))
* ensure WHERE is added when no prior conditions ([92a3a5e](https://github.com/reservoirprotocol/indexer/commit/92a3a5eb3a86afc86df077b881d798a1f7a28891))
* expose blur errors ([36781ef](https://github.com/reservoirprotocol/indexer/commit/36781ef144f38c0d8ec2dbafe63dd6e020ff0f64))
* fix bracket ([fe2de54](https://github.com/reservoirprotocol/indexer/commit/fe2de54c41777235db578a9ce4ba28ba234c15be))
* fix redundant ordering logic ([f4bbc4b](https://github.com/reservoirprotocol/indexer/commit/f4bbc4b6d5cde7021c0cbe444afa99d3ec68dc42))
* fix tokens timeout for large collectionsSetid ([ed2ae75](https://github.com/reservoirprotocol/indexer/commit/ed2ae750ff3b43cc2a780c4f28fb261ed6208265))
* performance improvements on owners/v1 and activity/v5 ([2183507](https://github.com/reservoirprotocol/indexer/commit/21835073f8341b8acb8bb7f07b322f3b0273fc6f))
* properly expose errors in the buy and sell apis ([bec2ee9](https://github.com/reservoirprotocol/indexer/commit/bec2ee9ecbdf8321c050bc92d69320beb7f74f14))
* refactor params ([1d985ce](https://github.com/reservoirprotocol/indexer/commit/1d985ce679c4ef304f865d6478962bf0f52adbeb))
* refactor params ([42a00f8](https://github.com/reservoirprotocol/indexer/commit/42a00f8420cb9a7d69d2021514eafe3bf90b2b99))
* refactor params ([4fefefd](https://github.com/reservoirprotocol/indexer/commit/4fefefde703b18fd651608719c468c4d175f12a2))
* semantic-release config ([e852b64](https://github.com/reservoirprotocol/indexer/commit/e852b645e7a32d22841634431f0914a431b1b6b6))
* specify table for normalized_floor_sell_value when not doing union ([b604ecf](https://github.com/reservoirprotocol/indexer/commit/b604ecfb774ed4fc6b8855ffdf8e933e8d2af144))
* specify table in all cases to avoid ambiguity ([74771a0](https://github.com/reservoirprotocol/indexer/commit/74771a064ca16d84aa5fb547c71888f7bf165b9d))
* variable names ([d156384](https://github.com/reservoirprotocol/indexer/commit/d1563844bd43261760f4675d2c5142e5ed745ea0))


### Features

* add contract to fill event price index ([1a1a31f](https://github.com/reservoirprotocol/indexer/commit/1a1a31f6b17f7316ccef9c5addcc55578cc51822))
* add fill_events_2_contract_price_index to original migration ([e2ad14b](https://github.com/reservoirprotocol/indexer/commit/e2ad14b65194be4a63871a76ed302c27e3eee4a0))
* add price logic for continuation ([733874c](https://github.com/reservoirprotocol/indexer/commit/733874c71507b91c7c5b832056923f850714c222))
* add sale price index migration ([af710ec](https://github.com/reservoirprotocol/indexer/commit/af710eca2f9539ed006f2a6a045d8df7781ab252))
* add sorting by time/price to sales v4 ([f1709fb](https://github.com/reservoirprotocol/indexer/commit/f1709fbeba85d1311804c0ba872e26e87e9a0e73))
* better exposure of filling errors ([b914422](https://github.com/reservoirprotocol/indexer/commit/b9144228d048ecf096522b8a290362ae58c2d98e))

# [5.277.0](https://github.com/reservoirprotocol/indexer/compare/v5.276.1...v5.277.0) (2023-03-21)


### Bug Fixes

* cleanup ([67185a2](https://github.com/reservoirprotocol/indexer/commit/67185a288e388e7f65503c132a16471044ec374b))
* early stop for opensea protected offers ([998cccc](https://github.com/reservoirprotocol/indexer/commit/998cccc02dadbd3cc6038418f14da31d13de1b9f))
* ensure WHERE is added when no prior conditions ([92a3a5e](https://github.com/reservoirprotocol/indexer/commit/92a3a5eb3a86afc86df077b881d798a1f7a28891))
* expose blur errors ([36781ef](https://github.com/reservoirprotocol/indexer/commit/36781ef144f38c0d8ec2dbafe63dd6e020ff0f64))
* fix bracket ([fe2de54](https://github.com/reservoirprotocol/indexer/commit/fe2de54c41777235db578a9ce4ba28ba234c15be))
* fix redundant ordering logic ([f4bbc4b](https://github.com/reservoirprotocol/indexer/commit/f4bbc4b6d5cde7021c0cbe444afa99d3ec68dc42))
* fix tokens timeout for large collectionsSetid ([ed2ae75](https://github.com/reservoirprotocol/indexer/commit/ed2ae750ff3b43cc2a780c4f28fb261ed6208265))
* performance improvements on owners/v1 and activity/v5 ([2183507](https://github.com/reservoirprotocol/indexer/commit/21835073f8341b8acb8bb7f07b322f3b0273fc6f))
* properly expose errors in the buy and sell apis ([bec2ee9](https://github.com/reservoirprotocol/indexer/commit/bec2ee9ecbdf8321c050bc92d69320beb7f74f14))
* refactor params ([1d985ce](https://github.com/reservoirprotocol/indexer/commit/1d985ce679c4ef304f865d6478962bf0f52adbeb))
* refactor params ([42a00f8](https://github.com/reservoirprotocol/indexer/commit/42a00f8420cb9a7d69d2021514eafe3bf90b2b99))
* refactor params ([4fefefd](https://github.com/reservoirprotocol/indexer/commit/4fefefde703b18fd651608719c468c4d175f12a2))
* semantic-release config ([e852b64](https://github.com/reservoirprotocol/indexer/commit/e852b645e7a32d22841634431f0914a431b1b6b6))
* specify table for normalized_floor_sell_value when not doing union ([b604ecf](https://github.com/reservoirprotocol/indexer/commit/b604ecfb774ed4fc6b8855ffdf8e933e8d2af144))
* variable names ([d156384](https://github.com/reservoirprotocol/indexer/commit/d1563844bd43261760f4675d2c5142e5ed745ea0))


### Features

* add contract to fill event price index ([1a1a31f](https://github.com/reservoirprotocol/indexer/commit/1a1a31f6b17f7316ccef9c5addcc55578cc51822))
* add fill_events_2_contract_price_index to original migration ([e2ad14b](https://github.com/reservoirprotocol/indexer/commit/e2ad14b65194be4a63871a76ed302c27e3eee4a0))
* add price logic for continuation ([733874c](https://github.com/reservoirprotocol/indexer/commit/733874c71507b91c7c5b832056923f850714c222))
* add sale price index migration ([af710ec](https://github.com/reservoirprotocol/indexer/commit/af710eca2f9539ed006f2a6a045d8df7781ab252))
* add sorting by time/price to sales v4 ([f1709fb](https://github.com/reservoirprotocol/indexer/commit/f1709fbeba85d1311804c0ba872e26e87e9a0e73))
* better exposure of filling errors ([b914422](https://github.com/reservoirprotocol/indexer/commit/b9144228d048ecf096522b8a290362ae58c2d98e))

# [5.277.0](https://github.com/reservoirprotocol/indexer/compare/v5.276.1...v5.277.0) (2023-03-21)


### Bug Fixes

* cleanup ([67185a2](https://github.com/reservoirprotocol/indexer/commit/67185a288e388e7f65503c132a16471044ec374b))
* early stop for opensea protected offers ([998cccc](https://github.com/reservoirprotocol/indexer/commit/998cccc02dadbd3cc6038418f14da31d13de1b9f))
* ensure WHERE is added when no prior conditions ([92a3a5e](https://github.com/reservoirprotocol/indexer/commit/92a3a5eb3a86afc86df077b881d798a1f7a28891))
* expose blur errors ([36781ef](https://github.com/reservoirprotocol/indexer/commit/36781ef144f38c0d8ec2dbafe63dd6e020ff0f64))
* fix bracket ([fe2de54](https://github.com/reservoirprotocol/indexer/commit/fe2de54c41777235db578a9ce4ba28ba234c15be))
* fix redundant ordering logic ([f4bbc4b](https://github.com/reservoirprotocol/indexer/commit/f4bbc4b6d5cde7021c0cbe444afa99d3ec68dc42))
* fix tokens timeout for large collectionsSetid ([ed2ae75](https://github.com/reservoirprotocol/indexer/commit/ed2ae750ff3b43cc2a780c4f28fb261ed6208265))
* performance improvements on owners/v1 and activity/v5 ([2183507](https://github.com/reservoirprotocol/indexer/commit/21835073f8341b8acb8bb7f07b322f3b0273fc6f))
* properly expose errors in the buy and sell apis ([bec2ee9](https://github.com/reservoirprotocol/indexer/commit/bec2ee9ecbdf8321c050bc92d69320beb7f74f14))
* refactor params ([1d985ce](https://github.com/reservoirprotocol/indexer/commit/1d985ce679c4ef304f865d6478962bf0f52adbeb))
* refactor params ([42a00f8](https://github.com/reservoirprotocol/indexer/commit/42a00f8420cb9a7d69d2021514eafe3bf90b2b99))
* refactor params ([4fefefd](https://github.com/reservoirprotocol/indexer/commit/4fefefde703b18fd651608719c468c4d175f12a2))
* semantic-release config ([e852b64](https://github.com/reservoirprotocol/indexer/commit/e852b645e7a32d22841634431f0914a431b1b6b6))
* variable names ([d156384](https://github.com/reservoirprotocol/indexer/commit/d1563844bd43261760f4675d2c5142e5ed745ea0))


### Features

* add contract to fill event price index ([1a1a31f](https://github.com/reservoirprotocol/indexer/commit/1a1a31f6b17f7316ccef9c5addcc55578cc51822))
* add fill_events_2_contract_price_index to original migration ([e2ad14b](https://github.com/reservoirprotocol/indexer/commit/e2ad14b65194be4a63871a76ed302c27e3eee4a0))
* add price logic for continuation ([733874c](https://github.com/reservoirprotocol/indexer/commit/733874c71507b91c7c5b832056923f850714c222))
* add sale price index migration ([af710ec](https://github.com/reservoirprotocol/indexer/commit/af710eca2f9539ed006f2a6a045d8df7781ab252))
* add sorting by time/price to sales v4 ([f1709fb](https://github.com/reservoirprotocol/indexer/commit/f1709fbeba85d1311804c0ba872e26e87e9a0e73))
* better exposure of filling errors ([b914422](https://github.com/reservoirprotocol/indexer/commit/b9144228d048ecf096522b8a290362ae58c2d98e))

# [5.277.0](https://github.com/reservoirprotocol/indexer/compare/v5.276.1...v5.277.0) (2023-03-21)


### Bug Fixes

* early stop for opensea protected offers ([998cccc](https://github.com/reservoirprotocol/indexer/commit/998cccc02dadbd3cc6038418f14da31d13de1b9f))
* expose blur errors ([36781ef](https://github.com/reservoirprotocol/indexer/commit/36781ef144f38c0d8ec2dbafe63dd6e020ff0f64))
* fix bracket ([fe2de54](https://github.com/reservoirprotocol/indexer/commit/fe2de54c41777235db578a9ce4ba28ba234c15be))
* fix redundant ordering logic ([f4bbc4b](https://github.com/reservoirprotocol/indexer/commit/f4bbc4b6d5cde7021c0cbe444afa99d3ec68dc42))
* properly expose errors in the buy and sell apis ([bec2ee9](https://github.com/reservoirprotocol/indexer/commit/bec2ee9ecbdf8321c050bc92d69320beb7f74f14))
* refactor params ([1d985ce](https://github.com/reservoirprotocol/indexer/commit/1d985ce679c4ef304f865d6478962bf0f52adbeb))
* refactor params ([42a00f8](https://github.com/reservoirprotocol/indexer/commit/42a00f8420cb9a7d69d2021514eafe3bf90b2b99))
* refactor params ([4fefefd](https://github.com/reservoirprotocol/indexer/commit/4fefefde703b18fd651608719c468c4d175f12a2))
* semantic-release config ([e852b64](https://github.com/reservoirprotocol/indexer/commit/e852b645e7a32d22841634431f0914a431b1b6b6))


### Features

* add contract to fill event price index ([1a1a31f](https://github.com/reservoirprotocol/indexer/commit/1a1a31f6b17f7316ccef9c5addcc55578cc51822))
* add fill_events_2_contract_price_index to original migration ([e2ad14b](https://github.com/reservoirprotocol/indexer/commit/e2ad14b65194be4a63871a76ed302c27e3eee4a0))
* add price logic for continuation ([733874c](https://github.com/reservoirprotocol/indexer/commit/733874c71507b91c7c5b832056923f850714c222))
* add sale price index migration ([af710ec](https://github.com/reservoirprotocol/indexer/commit/af710eca2f9539ed006f2a6a045d8df7781ab252))
* add sorting by time/price to sales v4 ([f1709fb](https://github.com/reservoirprotocol/indexer/commit/f1709fbeba85d1311804c0ba872e26e87e9a0e73))
* better exposure of filling errors ([b914422](https://github.com/reservoirprotocol/indexer/commit/b9144228d048ecf096522b8a290362ae58c2d98e))

## [5.276.1](https://github.com/reservoirprotocol/indexer/compare/v5.276.0...v5.276.1) (2023-03-21)


### Bug Fixes

* fix order source ([#3699](https://github.com/reservoirprotocol/indexer/issues/3699)) ([627bb78](https://github.com/reservoirprotocol/indexer/commit/627bb785d8eb88390ae97d8f327b36801a48c701))

# [5.276.0](https://github.com/reservoirprotocol/indexer/compare/v5.275.1...v5.276.0) (2023-03-20)


### Features

* collect ip from tracer client ([dfd1f25](https://github.com/reservoirprotocol/indexer/commit/dfd1f2571542ac3cdda83fa0a828c7f66ea2012b))

## [5.275.1](https://github.com/reservoirprotocol/indexer/compare/v5.275.0...v5.275.1) (2023-03-20)


### Bug Fixes

* fix getCollectionActivities call from < v4 collection eps ([8d3f6dc](https://github.com/reservoirprotocol/indexer/commit/8d3f6dc99c130d7be4846f3f74befa00886fdb39))

# [5.275.0](https://github.com/reservoirprotocol/indexer/compare/v5.274.0...v5.275.0) (2023-03-20)


### Bug Fixes

* add user tokens and check for currency ([a5a012e](https://github.com/reservoirprotocol/indexer/commit/a5a012e0d7875239fce7e854ea99cfa30eb27835))
* cleanup sale object to match across APIs ([6709480](https://github.com/reservoirprotocol/indexer/commit/67094807488e9073e2e068cd028c08bbfa0d9279))
* continue standardization of JoiSale object ([80eaa5d](https://github.com/reservoirprotocol/indexer/commit/80eaa5dabf01e2e6222ef3a3c35d01f3c6781d9c))
* don't use normalized values for lastSale ([6d04ccf](https://github.com/reservoirprotocol/indexer/commit/6d04ccfa440aee124a8ec8a2ef3877b29eeaeb13))
* eslint any warning ([415dfe7](https://github.com/reservoirprotocol/indexer/commit/415dfe7a929333047be2f4a42a9d57ceacfd535b))
* fix build ([59d4876](https://github.com/reservoirprotocol/indexer/commit/59d487699d467ae86ddac2dd0947778ea9866459))
* fully abstract sales response as JoiSale ([dc1ab26](https://github.com/reservoirprotocol/indexer/commit/dc1ab267a52d52f53cbb7f3762bbe4d5ce533356))
* merge user-tokens change from [#3641](https://github.com/reservoirprotocol/indexer/issues/3641) to v7 ([24c1854](https://github.com/reservoirprotocol/indexer/commit/24c18540e4ad2ac975636e5489099e03b50f80f5))
* remove unnecessary join from users tokens ([5b0c969](https://github.com/reservoirprotocol/indexer/commit/5b0c9698883a5fc3520a9dd62fe06822efb1871b))
* simplify lastSale response to match sales API ([190d886](https://github.com/reservoirprotocol/indexer/commit/190d886e1ac2e056f60c9144f8df2a8e79740576))
* standardize functions to get fee values ([ca7f7a9](https://github.com/reservoirprotocol/indexer/commit/ca7f7a9fb82f7e05621070ed2dbcd45fd58bf2bc))


### Features

* add JoiSaleObject ([16b893b](https://github.com/reservoirprotocol/indexer/commit/16b893bbe52c22e41120d8a36b8e13bcf65b1ade))
* add tokens/v6 to merge lastSell and lastBuy and include full royalty data ([84349d8](https://github.com/reservoirprotocol/indexer/commit/84349d832c812c4a2828740fe2bf6cedb08c1b4c))
* add user-tokens v7 to support includeLastSale with royalty breakdown ([456f05e](https://github.com/reservoirprotocol/indexer/commit/456f05e64a044f48ec23815007104f14efef5f39))
* return full lastSale data ([6f2fe46](https://github.com/reservoirprotocol/indexer/commit/6f2fe461d01ac8c04a03d619038cd52f4964d0d3))

# [5.274.0](https://github.com/reservoirprotocol/indexer/compare/v5.273.0...v5.274.0) (2023-03-20)


### Bug Fixes

* remove v6, make changes to v5 ([6ab8e73](https://github.com/reservoirprotocol/indexer/commit/6ab8e7335aa796d7b954d977d2a09aa05a5c1259))


### Features

* add attributes filtering to collections activity (v6) ([0b91ec7](https://github.com/reservoirprotocol/indexer/commit/0b91ec7bd3f604d405f233c6fdcc296103e9e018))

# [5.273.0](https://github.com/reservoirprotocol/indexer/compare/v5.272.2...v5.273.0) (2023-03-20)


### Bug Fixes

* test trigger pipeline ([5c8f0d9](https://github.com/reservoirprotocol/indexer/commit/5c8f0d9eb0344b2de11de86e82ee0ad61992b46c))


### Features

* added trait offers support ([#3691](https://github.com/reservoirprotocol/indexer/issues/3691)) ([e849d5d](https://github.com/reservoirprotocol/indexer/commit/e849d5dd3035ce96beb8497abb0f95d496e9537a))

## [5.272.2](https://github.com/reservoirprotocol/indexer/compare/v5.272.1...v5.272.2) (2023-03-20)


### Bug Fixes

* test trigger pipeline ([6be8453](https://github.com/reservoirprotocol/indexer/commit/6be8453806f5ad9beb26a8f85bbf659a2929de6b))

## [5.272.1](https://github.com/reservoirprotocol/indexer/compare/v5.272.0...v5.272.1) (2023-03-20)


### Bug Fixes

* pipeline ([b19a430](https://github.com/reservoirprotocol/indexer/commit/b19a430abc8ba318622743f84b93d2c618262845))

# [5.270.0](https://github.com/reservoirprotocol/indexer/compare/v5.269.1...v5.270.0) (2023-03-20)


### Features

* automatically update package.json version ([f9e4c94](https://github.com/reservoirprotocol/indexer/commit/f9e4c9409a0c162889fb6c1e37202391dc9941d5))

## [5.269.1](https://github.com/reservoirprotocol/indexer/compare/v5.269.0...v5.269.1) (2023-03-20)


### Bug Fixes

* opensea direct offer acceptance ([92c1ed0](https://github.com/reservoirprotocol/indexer/commit/92c1ed0536e024d8930fc55a75ce898bf7d0dbf0))

# [5.269.0](https://github.com/reservoirprotocol/indexer/compare/v5.268.0...v5.269.0) (2023-03-20)


### Bug Fixes

* refactor params ([d7fd841](https://github.com/reservoirprotocol/indexer/commit/d7fd841524d2d797e4273db83246169616a0c94e))
* refactor params ([cbf8089](https://github.com/reservoirprotocol/indexer/commit/cbf8089642d18e0a9f44ac36affa9f2df926e8f9))
* refactor params ([6602087](https://github.com/reservoirprotocol/indexer/commit/6602087f6f4deea9454affc2082a09e8608b292a))


### Features

* bulk cancel ([1c8fc33](https://github.com/reservoirprotocol/indexer/commit/1c8fc336b17d4ddf36b3315bda378e9a5e8f7e32))
* support bulk cancel ([144d52f](https://github.com/reservoirprotocol/indexer/commit/144d52f63a29c0a9ff52612d76b632258e84e4cc))

# [5.268.0](https://github.com/reservoirprotocol/indexer/compare/v5.267.0...v5.268.0) (2023-03-20)


### Features

* automatically update package.json version ([9def28e](https://github.com/reservoirprotocol/indexer/commit/9def28e1b9859efcfc2bfaec8b75736cc6e678c5))

# [5.267.0](https://github.com/reservoirprotocol/indexer/compare/v5.266.0...v5.267.0) (2023-03-20)


### Features

* better data in order fetcher callbacks ([74f86c9](https://github.com/reservoirprotocol/indexer/commit/74f86c9557a9cd3fe71ab57f2180b3e79805b7f1))

# [5.266.0](https://github.com/reservoirprotocol/indexer/compare/v5.265.0...v5.266.0) (2023-03-20)


### Features

* semantic version ([ff6f39e](https://github.com/reservoirprotocol/indexer/commit/ff6f39e4028d28503f769fdd267a1aad4c00537a))

## [5.262.4](https://github.com/reservoirprotocol/indexer/compare/v5.262.3...v5.262.4) (2023-03-17)


### Performance Improvements

* use backfill provider for the backfill of sale royalties ([30d3215](https://github.com/reservoirprotocol/indexer/commit/30d3215c0ef6850d8b057b2a2cdf05f52af20f98))

## [5.262.3](https://github.com/reservoirprotocol/indexer/compare/v5.262.2...v5.262.3) (2023-03-17)


### Bug Fixes

* zora and superrare ([d00b80e](https://github.com/reservoirprotocol/indexer/commit/d00b80e8fb45f5b60bf3e020e16dfdbd80dcf7f1))

## [5.262.2](https://github.com/reservoirprotocol/indexer/compare/v5.262.1...v5.262.2) (2023-03-17)


### Bug Fixes

* increase timestamp range ([5de3cb6](https://github.com/reservoirprotocol/indexer/commit/5de3cb64dc9f7d288ffa1ce6c1026c23a7aba4d2))

## [5.262.1](https://github.com/reservoirprotocol/indexer/compare/v5.262.0...v5.262.1) (2023-03-17)


### Bug Fixes

* filling x2y2 orders via raw data ([f8b30bf](https://github.com/reservoirprotocol/indexer/commit/f8b30bf51b9ac8cd5fab686a4914ea3971926260))

# [5.262.0](https://github.com/reservoirprotocol/indexer/compare/v5.261.4...v5.262.0) (2023-03-17)


### Bug Fixes

* add backfill to correct activities collectionId ([df9efd4](https://github.com/reservoirprotocol/indexer/commit/df9efd4375301b8b6df030b51e2765cdad7a497c))
* add more backfill jobs ([094134e](https://github.com/reservoirprotocol/indexer/commit/094134eb8e38b9a4596f276a36f72f2ccf79a746))
* add more backfill jobs ([0333e3e](https://github.com/reservoirprotocol/indexer/commit/0333e3e046694f7f2ea348fa75da2f8b4adac3e1))
* add superrare marketplace identifier to order id ([97f3f40](https://github.com/reservoirprotocol/indexer/commit/97f3f401d875ea012c190f9ce6a7910f70895e4d))
* add support for non-simulatable contracts ([24fe09a](https://github.com/reservoirprotocol/indexer/commit/24fe09a6f8c6dedb27c1564d7caf9fec9ea50316))
* add user_activities backfill for incorrect collection ids ([2921a9d](https://github.com/reservoirprotocol/indexer/commit/2921a9d13bafd0aebe24214784e040c65aeebdbc))
* build ([85e6bde](https://github.com/reservoirprotocol/indexer/commit/85e6bdee03d6a1d4270a0a8c8fa21295debe402c))
* build ([fb297eb](https://github.com/reservoirprotocol/indexer/commit/fb297ebf42b0f32d60f3edce304c6d287faad41b))
* buying by order id ([c93bf5c](https://github.com/reservoirprotocol/indexer/commit/c93bf5c236c0c7138aabbde8888df6134bf8911b))
* cancellation zone address ([274e8f2](https://github.com/reservoirprotocol/indexer/commit/274e8f2d39260d926cd03afbe78d5e1e7e9a65d3))
* change all fields to plain_text to prevent injection ([a466340](https://github.com/reservoirprotocol/indexer/commit/a46634078e56a51396e18c4a20e166b4bbbd4ebd))
* const fix ([26a47e1](https://github.com/reservoirprotocol/indexer/commit/26a47e1dbc7b52a1e454de927eb335f554aa9020))
* define error ([47bb0ab](https://github.com/reservoirprotocol/indexer/commit/47bb0ab5556474234d1c4ea6e23bc6808066c48c))
* disable cross-posting seaport orders ([27dfb3b](https://github.com/reservoirprotocol/indexer/commit/27dfb3b4ff164e8f516f6603ca692ab746ee8e89))
* don't include blur orders in normalized floor events/caches ([acc1072](https://github.com/reservoirprotocol/indexer/commit/acc1072628d2539a26c73eb57061059bd13e033f))
* fix from clause ([226765c](https://github.com/reservoirprotocol/indexer/commit/226765c11407aeee2a6fd5a844e34803b7af22da))
* force usage of seaport-v1.4 ([d35c594](https://github.com/reservoirprotocol/indexer/commit/d35c5949c2dc05269a1df7e159a0b38d125576f1))
* formatting fix ([1ba3aee](https://github.com/reservoirprotocol/indexer/commit/1ba3aee41ca05a3d730a0120d4ab75eb10f16631))
* integrate opensea's new protected offers zone ([69daa77](https://github.com/reservoirprotocol/indexer/commit/69daa771e7819bf27f87525dfbe804c87941acf6))
* join on schema_hash to prevent duplicate orders ([1de64cf](https://github.com/reservoirprotocol/indexer/commit/1de64cff10af3683914fac0318e3cf84331546e6))
* listing simulation ([b40efe9](https://github.com/reservoirprotocol/indexer/commit/b40efe9c1cca066d5149208891813c9a46122700))
* mark auth step as complete ([efaa075](https://github.com/reservoirprotocol/indexer/commit/efaa07521a33d8493ccbc39693af7b77fb3d573e))
* move address to sdk ([97555a9](https://github.com/reservoirprotocol/indexer/commit/97555a975ebeedb6576b0c519fb97906c72ff919))
* move address to sdk ([17fb245](https://github.com/reservoirprotocol/indexer/commit/17fb2459fd310fce70258b66f92cd8d431384300))
* move address to sdk ([f47d5fd](https://github.com/reservoirprotocol/indexer/commit/f47d5fdb8cd062b80f688644d621d0d7cac9a96f))
* opensea cross-posting ([9892191](https://github.com/reservoirprotocol/indexer/commit/9892191749628ad0ac7f6a4e5935520daeb27cce))
* opensea forwarding logic ([704851a](https://github.com/reservoirprotocol/indexer/commit/704851ae01a2485f02b0b31736305fe715ec8209))
* order posting for forwarded api keys ([0a7d7c0](https://github.com/reservoirprotocol/indexer/commit/0a7d7c05a32418f36b561d770d9e2588b1861c5b))
* orphaned blocks ([b619cbf](https://github.com/reservoirprotocol/indexer/commit/b619cbf85a9e9c00e4d5cda5b640ce0af23dbdd9))
* pass api key to order fetcher service ([adc9f72](https://github.com/reservoirprotocol/indexer/commit/adc9f727c26ba5a9b0c04c5d142649d0e826ca71))
* pricing on goerli ([c1000a4](https://github.com/reservoirprotocol/indexer/commit/c1000a43cfaffaa4cd8e8be3b10e266d3c29bc58))
* properly relay the signature to blur ([478e612](https://github.com/reservoirprotocol/indexer/commit/478e612cdc249eeaefedb1f23d54e915beec3102))
* rarible matching order builder ([6390999](https://github.com/reservoirprotocol/indexer/commit/6390999202ff741b0fe96cf808f2ff90f5f43f8c))
* re-enable floor simulation ([6baa782](https://github.com/reservoirprotocol/indexer/commit/6baa7828edec5f288894fa777051007634abd9d0))
* refactor sale royalties handling and support different fee recipients per collection ([6c6485b](https://github.com/reservoirprotocol/indexer/commit/6c6485bff8c530eb12056c8b32aa5b2d0912bf82))
* remove console log ([0996129](https://github.com/reservoirprotocol/indexer/commit/0996129bde161c3c03bcaed079f411ce6c135f81))
* remove error ([2e8cc43](https://github.com/reservoirprotocol/indexer/commit/2e8cc43189df97c50455978573d963880e393b86))
* remove log ([60d25c4](https://github.com/reservoirprotocol/indexer/commit/60d25c4745da57e45b157207261c258a39eb40f0))
* remove merge error ([1f08e81](https://github.com/reservoirprotocol/indexer/commit/1f08e81c6b0338b2f2d260d9adf602546bce44e0))
* remove steps with no items ([98c7622](https://github.com/reservoirprotocol/indexer/commit/98c7622d2f6c7984aa587d6355487e4e350e917c))
* remove superrare from v5 router ([64044ff](https://github.com/reservoirprotocol/indexer/commit/64044ffd2562e1ece68109170eac273283ab7f85))
* remove unused cursor ([644c772](https://github.com/reservoirprotocol/indexer/commit/644c772ba4ad43ff6f20e9b88b53fa31d95bc62c))
* return proper cross-posting errors ([19f1643](https://github.com/reservoirprotocol/indexer/commit/19f1643dda8aaf0204f8016047c5cf8b8c4a4ddd))
* royatiles test ([df235eb](https://github.com/reservoirprotocol/indexer/commit/df235eb6140fcaa2aeff716d91d66655c6fa481a))
* royatiles test ([e1a02a3](https://github.com/reservoirprotocol/indexer/commit/e1a02a38b9dae6af9c5ed4728fdb638a7b517845))
* set source bytes for blur calldata ([393b07d](https://github.com/reservoirprotocol/indexer/commit/393b07d37944212ba650b1e9727ff21c724ce95c))
* skip simulating blur orders ([9163282](https://github.com/reservoirprotocol/indexer/commit/91632829d128d0d17126280799bc99c4ec02e023))
* skip zero fees ([831f79b](https://github.com/reservoirprotocol/indexer/commit/831f79bd0042c06e9dd5de4be0a474db44be818f))
* submit sanitized values to slack webhook ([51a85d8](https://github.com/reservoirprotocol/indexer/commit/51a85d8b331aaf4b6d1aaf4e421319e7c1ba7c43))
* super rare order handling ([d5f2949](https://github.com/reservoirprotocol/indexer/commit/d5f2949b38d7790c1c39dc80d805ff1f001f5925))
* superrare minor fixes ([22d42b0](https://github.com/reservoirprotocol/indexer/commit/22d42b0d77e30de443ffcd5a9732bdc6bd6e8c77))
* superrare orders ([efac045](https://github.com/reservoirprotocol/indexer/commit/efac0450cc32f347c33a23eba9249b74e2c082e5))
* superrare orders issues ([30ed484](https://github.com/reservoirprotocol/indexer/commit/30ed48437955c5c5a8215f6c4d28dd6779ad89e2))
* superrare royalties ([ef0ea0f](https://github.com/reservoirprotocol/indexer/commit/ef0ea0f7212b639e283f0285ab3b06a10e741876))
* superrare set sale price ([8c3fb4c](https://github.com/reservoirprotocol/indexer/commit/8c3fb4c4703e56a9ea4e8fc51a113fae16be9c4e))
* support cancelling seaport-v1.4 orders ([d19f4e7](https://github.com/reservoirprotocol/indexer/commit/d19f4e7609921ff5ae9916251bbf4d5dc38251c9))
* support filling opensea offers directly ([3b41cb8](https://github.com/reservoirprotocol/indexer/commit/3b41cb8283db071bc806fcfd21d941f6ed155822))
* support for v1.1 and v1.4 seaport cross-posting ([8d9b178](https://github.com/reservoirprotocol/indexer/commit/8d9b1784afa85536847bf679c91d76e69ac8b851))
* support off-chain cancelled orders ([dc342a3](https://github.com/reservoirprotocol/indexer/commit/dc342a348e6ddbaad1d1db92939ed2b8d85e570d))
* support seaport-v1.4 erc20 listings ([367ec5e](https://github.com/reservoirprotocol/indexer/commit/367ec5ed325ba7ebb075be54b4c7f9e53b727322))
* treat everything as an object ([fb9b6b2](https://github.com/reservoirprotocol/indexer/commit/fb9b6b25aee55b0755f44f82bcfd989b9c44e3ba))
* tweaks ([3690b8b](https://github.com/reservoirprotocol/indexer/commit/3690b8bef31c7723106d03283ff452a62f567e0c))
* tweaks ([a5b5772](https://github.com/reservoirprotocol/indexer/commit/a5b57723a9a201ab9f93da2ec2ffcb92a5a27f38))
* tweaks ([d745ec5](https://github.com/reservoirprotocol/indexer/commit/d745ec5c503aa7521dad6c64712e17dffb4506b0))
* tweaks ([a85e06c](https://github.com/reservoirprotocol/indexer/commit/a85e06c866933f29c7dfac78f70898445a5f5dac))
* tweaks ([a487f57](https://github.com/reservoirprotocol/indexer/commit/a487f5797cfe35c90246b5b481c4924dfb182a1a))
* tweaks ([f76a58f](https://github.com/reservoirprotocol/indexer/commit/f76a58ff5d780e6d7ea6899039a3fbe56d89ce66))
* tweaks ([7be1113](https://github.com/reservoirprotocol/indexer/commit/7be11131c22d77459cb227551e0aa72197447766))
* tweaks ([97159cc](https://github.com/reservoirprotocol/indexer/commit/97159cc041127709ad96ec07f04fa01d78170556))
* tweaks ([83a621d](https://github.com/reservoirprotocol/indexer/commit/83a621d2dc752e8b40b9b763d0a56417f99d92ad))
* tweaks ([315a29d](https://github.com/reservoirprotocol/indexer/commit/315a29d31cde7416b1dda338761c88e7b842fc6d))
* update superrare router return value ([d7b5405](https://github.com/reservoirprotocol/indexer/commit/d7b5405dfa29cdb8fa4fd353103d4b5b5b960531))
* use regular signatures when a single seaport-v1.4 order is created ([59bd2eb](https://github.com/reservoirprotocol/indexer/commit/59bd2ebf6cd05f49e96311a268cf9f75fcbdf555))
* use superrare orderId in fill events ([9bab5ee](https://github.com/reservoirprotocol/indexer/commit/9bab5ee0c23ecccb61a56edadfadc5c52da03421))
* various tweaks ([d0bc1d8](https://github.com/reservoirprotocol/indexer/commit/d0bc1d8f7fe8db0dbe252c1796d846247c376229))
* various tweaks ([08ceb10](https://github.com/reservoirprotocol/indexer/commit/08ceb10b958fa87d7bb7b02803d7cc6c4bb0cfe1))
* wrong access ([14c613a](https://github.com/reservoirprotocol/indexer/commit/14c613ac4a6c0d832a1463bbb3a5b3558427ea25))
* x2y2 ([446199d](https://github.com/reservoirprotocol/indexer/commit/446199db27490e6fa26bb0d00ff33979cd59ce02))
* x2y2 ([6010994](https://github.com/reservoirprotocol/indexer/commit/60109946b5fcfa0e658e4661f170d85b59902034))
* yarn.lock ([0b08b1d](https://github.com/reservoirprotocol/indexer/commit/0b08b1de293d42bd819aaea18ea45cfd7b9227cc))


### Features

* add admin api for resyncing sale royalties ([4f647da](https://github.com/reservoirprotocol/indexer/commit/4f647dadebaad1f6ba0e9c2efc3e991422a0e296))
* add index from pganalyze recommendation ([8703fb5](https://github.com/reservoirprotocol/indexer/commit/8703fb5cf1c692239c90b1e8e925ce05c53afc14))
* add lock via bullmq ([2d55d6c](https://github.com/reservoirprotocol/indexer/commit/2d55d6c0ed4353b869a998b4f412b97306fb3627))
* add log ([cdf2f5e](https://github.com/reservoirprotocol/indexer/commit/cdf2f5ee0e9f4b5a2299a806d46a5c6f5e2c4877))
* add log ([17028ea](https://github.com/reservoirprotocol/indexer/commit/17028ead771a2c93816da83866783be82e683c42))
* add prompt to create an account for an api key when rate limited ([69e1407](https://github.com/reservoirprotocol/indexer/commit/69e1407fc44720c7bef7d2184209c7208c7f85d7))
* add sortBy and sortDirection to user collections v2 ([509d40c](https://github.com/reservoirprotocol/indexer/commit/509d40c1d7523a7cb4de9da9858ec39b221f2822))
* add support for buying flagged tokens ([a9c0010](https://github.com/reservoirprotocol/indexer/commit/a9c0010d0d72a4bec77417b76adb43c36a2ce590))
* added cross posting status tracking ([#3402](https://github.com/reservoirprotocol/indexer/issues/3402)) ([692dcd9](https://github.com/reservoirprotocol/indexer/commit/692dcd9d9112700c7da742eb31bde7772787a81b))
* added last appraisal value sort by ([#3641](https://github.com/reservoirprotocol/indexer/issues/3641)) ([1e6a310](https://github.com/reservoirprotocol/indexer/commit/1e6a3104e2ea0865a7ac6f53d325d3e623d2ee34))
* added log ([6fca60e](https://github.com/reservoirprotocol/indexer/commit/6fca60ea9567bdb60211ca036017265909b20a6f))
* added log ([8629a69](https://github.com/reservoirprotocol/indexer/commit/8629a695c280b897c671232c03e6bb4327ebd242))
* added log ([144acae](https://github.com/reservoirprotocol/indexer/commit/144acae47d6b21652b3ed1d707fe87a3492fd8f8))
* added log ([c635958](https://github.com/reservoirprotocol/indexer/commit/c6359582f680fbb93ad01667dc03f53823af8bf7))
* added monitor for realtime sync on polygon and arbitrum ([167083c](https://github.com/reservoirprotocol/indexer/commit/167083c78e19f253bf3aa69c426c8fc16549fe19))
* added realtime process queue monitoring ([5575658](https://github.com/reservoirprotocol/indexer/commit/5575658fe4b5f07d6ed199305bd3f1910b6a6c91))
* adding tokenCount to search collections api ([62635ca](https://github.com/reservoirprotocol/indexer/commit/62635cae3202518f3ce1838b26c806f0d6850216))
* basic support for blur ([db97e72](https://github.com/reservoirprotocol/indexer/commit/db97e72fb825370cf0e31e2018362f57217f33ed))
* bigger batches nft transfer ([bb6e6b5](https://github.com/reservoirprotocol/indexer/commit/bb6e6b573001368eb5b04a61141e2c605226d684))
* check marketplace address in allPlatformFeeRecipients ([4e46b1d](https://github.com/reservoirprotocol/indexer/commit/4e46b1d9556e92214eb2b7ff0d9080a958132b90))
* chunk polygon inserts to nft_transfer_events ([a15d693](https://github.com/reservoirprotocol/indexer/commit/a15d693bc48170ac1f472df4581cc9b420228ed5))
* chunk polygon inserts to nft_transfer_events ([204253a](https://github.com/reservoirprotocol/indexer/commit/204253ad8cbe5165604aeca0c4a927c5c7c24f48))
* chunk polygon inserts to nft_transfer_events ([36776d3](https://github.com/reservoirprotocol/indexer/commit/36776d310dd32e21d0e5d6037e1f16026bb05e95))
* chunk polygon inserts to nft_transfer_events ([b819ee6](https://github.com/reservoirprotocol/indexer/commit/b819ee6bde84262433849f38973e65e1d0c6e9e5))
* chunk polygon inserts to nft_transfer_events ([6a4b1ad](https://github.com/reservoirprotocol/indexer/commit/6a4b1adbe73f81ac4f140a84591ccad2387fa261))
* conditional data ([eec6b2a](https://github.com/reservoirprotocol/indexer/commit/eec6b2ac8ce8e20af12849e8cf55f1124161e7ba))
* default order kind to seaport-v1.4 in v4 list and bid apis ([25adfb2](https://github.com/reservoirprotocol/indexer/commit/25adfb22ea86f84593c258c14eed68c0681f88d6))
* default to royalty rather marketplace fee ([53888c9](https://github.com/reservoirprotocol/indexer/commit/53888c9de884c0a60b070e6f791dbb606157a2c9))
* deprecate order/v3 ([c112982](https://github.com/reservoirprotocol/indexer/commit/c1129823912b08814eb65fa1df161eace10408ce))
* deprecating token-floor-ask/v3 ([bf99847](https://github.com/reservoirprotocol/indexer/commit/bf9984780b1eb4dfdd9244671e06b5d166981506))
* disable simulation ([38bd430](https://github.com/reservoirprotocol/indexer/commit/38bd430a120a92c7e6ad8518633deacaeb19e59d))
* don't force seaport 1.4 ([d3a586d](https://github.com/reservoirprotocol/indexer/commit/d3a586da75c8dd124d99f9e140dbbbc1c767de26))
* don't pass spec ([ca5b8bc](https://github.com/reservoirprotocol/indexer/commit/ca5b8bc64d19f539b98ba87504b493ef3aeb4e03))
* faster sync ([fcc57a7](https://github.com/reservoirprotocol/indexer/commit/fcc57a740f7c439ea698513aa3180f4845e58c5b))
* fetch tokens in collection in iterations ([b8af961](https://github.com/reservoirprotocol/indexer/commit/b8af961be4df07b7424b95d55b777552a4c62c0f))
* fix realtime lock ([a3b1af5](https://github.com/reservoirprotocol/indexer/commit/a3b1af52eac079ef6534a8d3378f204ff8757b26))
* for safety skip invalidation on 500 errors ([ea9bb5f](https://github.com/reservoirprotocol/indexer/commit/ea9bb5f8c45710f7f35e1548240e9371bb2a3894))
* get less blocks for arbitrum ([621dacc](https://github.com/reservoirprotocol/indexer/commit/621dacca3593b4cf8311f11a6d1fdf9a32b40015))
* get less blocks for arbitrum ([fdc9af3](https://github.com/reservoirprotocol/indexer/commit/fdc9af36f45b0934c92b754b6ec8778f043c0c79))
* get more blocks for arbitrum ([3f9a003](https://github.com/reservoirprotocol/indexer/commit/3f9a0033cb6af336ac81792a5a0f128a3e769dba))
* include params when evaluating rate limit rule ([c61b43e](https://github.com/reservoirprotocol/indexer/commit/c61b43e7f207a681d0d38f255fd184d3c1890937))
* increase connection pool for workers ([5e33524](https://github.com/reservoirprotocol/indexer/commit/5e335241baae748943bc3fea6db323c4639c85ae))
* insert all at once ([277a555](https://github.com/reservoirprotocol/indexer/commit/277a555c317768042eea0788dc2cc28089c51b14))
* insert into nft_transfer_events in transactions ([a3ff9e4](https://github.com/reservoirprotocol/indexer/commit/a3ff9e443a599bcccf6bbecd08ca6fad0d23616e))
* matching token count type on search collections endpoint to collections/v5 ([2e736ff](https://github.com/reservoirprotocol/indexer/commit/2e736ff771532acbe39c054ce109653472278dd0))
* merge main ([3130239](https://github.com/reservoirprotocol/indexer/commit/3130239a06d2694fcf009d9e8bd91c67ae67b6e1))
* origin check ([8d1974d](https://github.com/reservoirprotocol/indexer/commit/8d1974dae5e664a81f74afa5dade60040aca1a22))
* origin check ([74b94c0](https://github.com/reservoirprotocol/indexer/commit/74b94c03bb92d6f732786659df2a64fe4ee38ebe))
* origin check ([09f19bf](https://github.com/reservoirprotocol/indexer/commit/09f19bf20bbf1690fa012f050cccbd3a8cd41dde))
* prepare for partial seaport listings ([6d59148](https://github.com/reservoirprotocol/indexer/commit/6d591489c464324101bb73eeb445d765afb869e0))
* prioritize new events ([1d94934](https://github.com/reservoirprotocol/indexer/commit/1d949341d60e3cad093eb4322b7bf93cee152f54))
* prioritize new events ([226eea8](https://github.com/reservoirprotocol/indexer/commit/226eea81e69e2c9fd0857909abc5ce6f48c23969))
* remove delay backfill-nft-balances-last-token-appraisal-value-queue ([cad907e](https://github.com/reservoirprotocol/indexer/commit/cad907ea8560b8f2e23ce3ced21d5893aff7f6b4))
* remove lock ([7768c54](https://github.com/reservoirprotocol/indexer/commit/7768c54ecc7d7e0260316f07358a8d9887fad829))
* remove on fail ([b4f7abd](https://github.com/reservoirprotocol/indexer/commit/b4f7abd958e273872ad4c24839fb8bf78a5c37c6))
* remove on fail ([a9819a4](https://github.com/reservoirprotocol/indexer/commit/a9819a47d5d19119ea121ccc52e1f3a12c8ffd87))
* remove on fail ([524f585](https://github.com/reservoirprotocol/indexer/commit/524f585e1d05f875b13bcaaf448977e6e1936cdb))
* restore backfill-nft-balances-last-token-appraisal-value-queue ([6a932ff](https://github.com/reservoirprotocol/indexer/commit/6a932ffacbac0e88f30d7e548994cbc3d05d5293))
* return converted quotes when buying in a different currency ([9dc2fd0](https://github.com/reservoirprotocol/indexer/commit/9dc2fd02fda6d38cd9d83282cc27eb078e3df295))
* return tier header if rate limited ([d4a3392](https://github.com/reservoirprotocol/indexer/commit/d4a33928c54341fe61d691660e287bb216fbba30))
* returning createdAt and openseaVerificationStatus from user-collections endpoint ([41ca314](https://github.com/reservoirprotocol/indexer/commit/41ca3140250ec9705a4706644a6e40bf07b379cb))
* royalties improve ([a810048](https://github.com/reservoirprotocol/indexer/commit/a8100481effd7b2f7c1fe85113e62bfb962403ea))
* sanitizing api key values before posting to slack ([3fe146d](https://github.com/reservoirprotocol/indexer/commit/3fe146d961ededc7df5d348dca943a354e9806e5))
* smaller batches nft transfer ([bd3ab15](https://github.com/reservoirprotocol/indexer/commit/bd3ab151e67e24f976e7aeb96ea1f6cb6520bda7))
* superrare sdk and order ingesting WIP ([d68581c](https://github.com/reservoirprotocol/indexer/commit/d68581c72c138deda3636babe1d643f72508865f))
* support backfilling sale royalties for a single contract ([34b4a92](https://github.com/reservoirprotocol/indexer/commit/34b4a92ebce1e12c9e29f2a4bcb115322b0dbc6d))
* support blocking route by setting points as -1 ([9045c63](https://github.com/reservoirprotocol/indexer/commit/9045c6385058d00aebdd002aa920d9303856d132))
* support multiple fill transactions ([87ba2f7](https://github.com/reservoirprotocol/indexer/commit/87ba2f7149f3c496fbc89b6eb4154ad94a775bae))
* support opensea authorization ([9f39a6f](https://github.com/reservoirprotocol/indexer/commit/9f39a6f170ddf1399081d792c2eb4a2e45aa8c7d))
* trigger next job from the completed callback ([d23124d](https://github.com/reservoirprotocol/indexer/commit/d23124d3ea9a7d4e86c9f1da8655ea06e0d4c48f))
* update ([e18cd14](https://github.com/reservoirprotocol/indexer/commit/e18cd14fe3aad4ce3d2375084b953d76bfeb0206))
* update arbitrum blocks number ([320c797](https://github.com/reservoirprotocol/indexer/commit/320c7973193e726138e5128dc40caa9d33d7a038))
* update arbitrum network ([f48b016](https://github.com/reservoirprotocol/indexer/commit/f48b016b7260c19e0bc30eda5c2fb628991d3179))
* update collection for opensea shared contract ([aed4a62](https://github.com/reservoirprotocol/indexer/commit/aed4a6253bce2c86062e579b27567bfb4ec1f2e9))
* update collection for opensea shared contract ([c6f2729](https://github.com/reservoirprotocol/indexer/commit/c6f2729cd117898c415100ae00e97f0b37dc6022))
* update collection for opensea shared contract ([fcb927c](https://github.com/reservoirprotocol/indexer/commit/fcb927c730fe4bfce4993a2562ea944443e98954))
* update concurrency ([632f4b4](https://github.com/reservoirprotocol/indexer/commit/632f4b4284420d384c3b379d171af6d8fb24031d))
* update concurrency for nft-balance-updates-update-floor-ask-price-queue ([ecd85d7](https://github.com/reservoirprotocol/indexer/commit/ecd85d72399d13a0e16a7f98cb32ebdc069d0ec1))
* update concurrency for process-activity-event-queue ([d1503f1](https://github.com/reservoirprotocol/indexer/commit/d1503f1eef7abced72cc64b50072b79fe661ba3e))
* update lastBlockLatency for polygon ([8c636fe](https://github.com/reservoirprotocol/indexer/commit/8c636fed205121835b159bf331c409bd6b218156))
* update log ([258e849](https://github.com/reservoirprotocol/indexer/commit/258e849b4c6171607c7e552f22e8104cf19815ce))
* update log ([6997904](https://github.com/reservoirprotocol/indexer/commit/69979042b79d077cbd93b111c188415b0642bbcb))
* update log ([95ee0a4](https://github.com/reservoirprotocol/indexer/commit/95ee0a4244569b10a91558411a38fa3fc58da477))
* update log ([07bf0f5](https://github.com/reservoirprotocol/indexer/commit/07bf0f5e39fda806d204cfcfc37ec36fe014ac54))
* update nonSimulatableContracts ([b531c5d](https://github.com/reservoirprotocol/indexer/commit/b531c5d24e8bec87e15e55c6ce98672856f12bd2))
* update optimism ([a8e1ce9](https://github.com/reservoirprotocol/indexer/commit/a8e1ce930010edfba58d463971961a9b2362b889))
* update optimism ([d0e26c8](https://github.com/reservoirprotocol/indexer/commit/d0e26c8fd27a45f1f88eae97997b2e0d9c5c5e0f))
* update optimism ([085f808](https://github.com/reservoirprotocol/indexer/commit/085f8085f9011ef767eef26a49415794979b6f94))
* update optimism/arbitrum network ([0f8411d](https://github.com/reservoirprotocol/indexer/commit/0f8411d5007fbef31e7b2f197ec21b90a17c2840))
* update polygon network ([756d41e](https://github.com/reservoirprotocol/indexer/commit/756d41ec09997d996ee3cadb4d1c2db65230d760))
* update polygon network ([9109aff](https://github.com/reservoirprotocol/indexer/commit/9109affe91f482f1ad28a66ef0b51ece37ae6b32))
* update polygon network ([6792e67](https://github.com/reservoirprotocol/indexer/commit/6792e673a9cea9cfd4021149c3303ba26c32d19b))
* update polygon network ([e0a95bf](https://github.com/reservoirprotocol/indexer/commit/e0a95bfe688dcda35e66929571014794203daf21))
* update queue settings ([a6d4d29](https://github.com/reservoirprotocol/indexer/commit/a6d4d29c8157e86c3a0c8c6b9ac943bb6e88754f))
* update update-collection-daily-volume-queue concurrency ([5e9c59d](https://github.com/reservoirprotocol/indexer/commit/5e9c59d225a37475c433632db7bc3bf30a86c636))
* update yargs-parser ([e88669d](https://github.com/reservoirprotocol/indexer/commit/e88669ded05539e181ce7cf8800e0ed1ccfde13f))
* use sample of highest tokens owned by user ([67cd036](https://github.com/reservoirprotocol/indexer/commit/67cd036cb89f159e29ce08b3760cf45dfbb84d70))


### Reverts

* Revert "feat: call buy and sell v7 when simulating" ([5532478](https://github.com/reservoirprotocol/indexer/commit/55324786cbb0ba7303c29d96445f8d79b2d39a4e))
* Revert "feat: update internal call to v7" ([aa65cb1](https://github.com/reservoirprotocol/indexer/commit/aa65cb1f063b0d2bd1e0fb448efe57b35ce88534))

## [5.261.4](https://github.com/reservoirprotocol/indexer/compare/v5.261.3...v5.261.4) (2023-03-08)


### Bug Fixes

* update actions versions in pipeline ([fec815a](https://github.com/reservoirprotocol/indexer/commit/fec815a4055f7b362166b7b02a64b160a344d63d))

## [5.261.3](https://github.com/reservoirprotocol/indexer/compare/v5.261.2...v5.261.3) (2023-03-08)


### Bug Fixes

* pipeline ([9d7e9ad](https://github.com/reservoirprotocol/indexer/commit/9d7e9ad84819d7f2163dcf0d96ce9f48a50e83a7))

## [5.261.2](https://github.com/reservoirprotocol/indexer/compare/v5.261.1...v5.261.2) (2023-03-08)


### Bug Fixes

* dockerfile ([edb57a3](https://github.com/reservoirprotocol/indexer/commit/edb57a31ae121ec5d0dec8f43fa13e2f92fd913b))

## [5.261.1](https://github.com/reservoirprotocol/indexer/compare/v5.261.0...v5.261.1) (2023-03-07)


### Bug Fixes

* ghcr ([74afb30](https://github.com/reservoirprotocol/indexer/commit/74afb30dd08872b5b948254509da5229d166693f))

# [5.261.0](https://github.com/reservoirprotocol/indexer/compare/v5.260.0...v5.261.0) (2023-03-07)


### Bug Fixes

* semantic version ([e2e70c7](https://github.com/reservoirprotocol/indexer/commit/e2e70c7eea0a206fba656158df717c81f859b72f))
* semantic version ([c85f7c0](https://github.com/reservoirprotocol/indexer/commit/c85f7c05af372d18379dcb170babd87b5c2ddabc))


### Features

* build workflow ([238e22a](https://github.com/reservoirprotocol/indexer/commit/238e22af94e47caccb4473824031541db07197e9))
* build workflow ([a9ed93f](https://github.com/reservoirprotocol/indexer/commit/a9ed93fba3a49194338f94f84feeaeb1ae67a87b))

# [5.260.0](https://github.com/reservoirprotocol/indexer/compare/v5.259.0...v5.260.0) (2023-03-07)


### Features

* clean changelog ([92623fa](https://github.com/reservoirprotocol/indexer/commit/92623fa36c4de808cc45b80e9473017024e2bbe4))


# [5.260.0](https://github.com/reservoirprotocol/indexer/compare/v5.259.0...v5.260.0) (2023-03-07)


### Features

* clean changelog ([92623fa](https://github.com/reservoirprotocol/indexer/commit/92623fa36c4de808cc45b80e9473017024e2bbe4))
