import "reflect-metadata";
import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();

import { DataSource } from "typeorm";
import { config } from "@/config/index";

import { Allowlists } from "./entities/Allowlists";
import { AllowlistsItems } from "./entities/AllowlistsItems";
import { ApiKeys } from "./entities/ApiKeys";
import { AttributeKeys } from "./entities/AttributeKeys";
import { Attributes } from "./entities/Attributes";
import { BidEvents } from "./entities/BidEvents";
import { Blocks } from "./entities/Blocks";
import { BulkCancelEvents } from "./entities/BulkCancelEvents";
import { BundleItems } from "./entities/BundleItems";
import { Bundles } from "./entities/Bundles";
import { CancelEvents } from "./entities/CancelEvents";
import { CollectionFloorSellEvents } from "./entities/CollectionFloorSellEvents";
import { CollectionMintStandards } from "./entities/CollectionMintStandards";
import { CollectionMints } from "./entities/CollectionMints";
import { CollectionNonFlaggedFloorSellEvents } from "./entities/CollectionNonFlaggedFloorSellEvents";
import { CollectionNormalizedFloorSellEvents } from "./entities/CollectionNormalizedFloorSellEvents";
import { CollectionTopBidEvents } from "./entities/CollectionTopBidEvents";
import { Collections } from "./entities/Collections";
import { CollectionsSets } from "./entities/CollectionsSets";
import { CollectionsSetsCollections } from "./entities/CollectionsSetsCollections";
import { CollectionxyzPools } from "./entities/CollectionxyzPools";
import { Contracts } from "./entities/Contracts";
import { ContractsSets } from "./entities/ContractsSets";
import { ContractsSetsContracts } from "./entities/ContractsSetsContracts";
import { CrossPostingOrders } from "./entities/CrossPostingOrders";
import { Currencies } from "./entities/Currencies";
import { DailyApiUsage } from "./entities/DailyApiUsage";
import { DailyVolumes } from "./entities/DailyVolumes";
import { DataExportTasks } from "./entities/DataExportTasks";
import { Erc721cConfigs } from "./entities/Erc721cConfigs";
import { Erc721cOperatorWhitelists } from "./entities/Erc721cOperatorWhitelists";
import { Erc721cPermittedContractReceiverAllowlists } from "./entities/Erc721cPermittedContractReceiverAllowlists";
import { Erc721cVerifiedEoas } from "./entities/Erc721cVerifiedEoas";
import { ExecutionResults } from "./entities/ExecutionResults";
import { Executions } from "./entities/Executions";
import { FeeRecipients } from "./entities/FeeRecipients";
import { FillEvents_2 } from "./entities/FillEvents_2";
import { FtApprovals } from "./entities/FtApprovals";
import { FtBalances } from "./entities/FtBalances";
import { FtTransferEvents } from "./entities/FtTransferEvents";
import { HourlyApiUsage } from "./entities/HourlyApiUsage";
import { LooksrareV2SubsetNonceCancelEvents } from "./entities/LooksrareV2SubsetNonceCancelEvents";
import { MethodSignatures } from "./entities/MethodSignatures";
import { MidaswapPools } from "./entities/MidaswapPools";
import { MonthlyApiUsage } from "./entities/MonthlyApiUsage";
import { MqJobsData } from "./entities/MqJobsData";
import { NftApprovalEvents } from "./entities/NftApprovalEvents";
import { NftBalances } from "./entities/NftBalances";
import { NftTransferEvents } from "./entities/NftTransferEvents";
import { NftxFtPools } from "./entities/NftxFtPools";
import { NftxNftPools } from "./entities/NftxNftPools";
import { NonceCancelEvents } from "./entities/NonceCancelEvents";
import { OrderEvents } from "./entities/OrderEvents";
import { Orders } from "./entities/Orders";
import { Pgmigrations } from "./entities/Pgmigrations";
import { RateLimitRules } from "./entities/RateLimitRules";
import { RemovedAttributeKeys } from "./entities/RemovedAttributeKeys";
import { RemovedAttributes } from "./entities/RemovedAttributes";
import { RemovedTokenAttributes } from "./entities/RemovedTokenAttributes";
import { Routers } from "./entities/Routers";
import { SeaportConduitOpenChannels } from "./entities/SeaportConduitOpenChannels";
import { Sources } from "./entities/Sources";
import { SourcesV2 } from "./entities/SourcesV2";
import { SudoswapPools } from "./entities/SudoswapPools";
import { SudoswapV2Pools } from "./entities/SudoswapV2Pools";
import { TokenAttributes } from "./entities/TokenAttributes";
import { TokenFloorSellEvents } from "./entities/TokenFloorSellEvents";
import { TokenNormalizedFloorSellEvents } from "./entities/TokenNormalizedFloorSellEvents";
import { TokenSets } from "./entities/TokenSets";
import { TokenSetsTokens } from "./entities/TokenSetsTokens";
import { Tokens } from "./entities/Tokens";
import { TransactionLogs } from "./entities/TransactionLogs";
import { TransactionTraces } from "./entities/TransactionTraces";
import { Transactions } from "./entities/Transactions";
import { UsdPrices } from "./entities/UsdPrices";
import { WyvernProxies } from "./entities/WyvernProxies";
import { Contracts1643714045649 } from "./migration/1643714045649-Contracts";
import { Tokens1643714286947 } from "./migration/1643714286947-Tokens";
import { Transfers1643714475176 } from "./migration/1643714475176-Transfers";
import { Balances1643716513646 } from "./migration/1643716513646-Balances";
import { TokenSets1643803474513 } from "./migration/1643803474513-TokenSets";
import { Orders1643809164129 } from "./migration/1643809164129-Orders";
import { Cancels1643809164130 } from "./migration/1643809164130-Cancels";
import { Collections1644406305587 } from "./migration/1644406305587-Collections";
import { Fills1644930748093 } from "./migration/1644930748093-Fills";
import { BulkCancels1645184399776 } from "./migration/1645184399776-BulkCancels";
import { ApiKeys1645443452270 } from "./migration/1645443452270-ApiKeys";
import { Approvals1645692953082 } from "./migration/1645692953082-Approvals";
import { DailyVolumes1645976283000 } from "./migration/1645976283000-DailyVolumes";
import { TokenFloorSellEvents1646061361108 } from "./migration/1646061361108-TokenFloorSellEvents";
import { Attributes1646736672602 } from "./migration/1646736672602-Attributes";
import { NonceCancels1648551570381 } from "./migration/1648551570381-NonceCancels";
import { Sources1648833416270 } from "./migration/1648833416270-Sources";
import { Sources1648833417270 } from "./migration/1648833417270-Sources";
import { DailyVolumesAdditions1649749835254 } from "./migration/1649749835254-DailyVolumesAdditions";
import { CollectionFloorSellEvents1650270396016 } from "./migration/1650270396016-CollectionFloorSellEvents";
import { OrderEvents1650352850828 } from "./migration/1650352850828-OrderEvents";
import { Collections1652455437828 } from "./migration/1652455437828-Collections";
import { Activities1652729912828 } from "./migration/1652729912828-Activities";
import { UserActivities1653599990214 } from "./migration/1653599990214-UserActivities";
import { Transactions1654498276444 } from "./migration/1654498276444-Transactions";
import { Blocks1654505890174 } from "./migration/1654505890174-Blocks";
import { FtApprovals1654533259333 } from "./migration/1654533259333-FtApprovals";
import { DataExportTasks1655818401898 } from "./migration/1655818401898-DataExportTasks";
import { Removed1655836381302 } from "./migration/1655836381302-Removed";
import { Bundles1657111173185 } from "./migration/1657111173185-Bundles";
import { ImprovedTransactions1657788711516 } from "./migration/1657788711516-ImprovedTransactions";
import { ImprovedBlocks1657805402797 } from "./migration/1657805402797-ImprovedBlocks";
import { ImprovedFills1658816965601 } from "./migration/1658816965601-ImprovedFills";
import { WashTradingScore1658932920910 } from "./migration/1658932920910-WashTradingScore";
import { ElementOrderKind1659029948930 } from "./migration/1659029948930-ElementOrderKind";
import { RaribleOrderKind1659101094534 } from "./migration/1659101094534-RaribleOrderKind";
import { CurrenciesAndPrices1659435546006 } from "./migration/1659435546006-CurrenciesAndPrices";
import { QuixoticOrderKind1659596160207 } from "./migration/1659596160207-QuixoticOrderKind";
import { ZoraOrderKind1659625683558 } from "./migration/1659625683558-ZoraOrderKind";
import { Tokens1659729455123 } from "./migration/1659729455123-Tokens";
import { BidEvents1660053361963 } from "./migration/1660053361963-BidEvents";
import { Collections1660056506587 } from "./migration/1660056506587-Collections";
import { OrderCurrency1660812104602 } from "./migration/1660812104602-OrderCurrency";
import { CollectionTopBidEvents1660915707393 } from "./migration/1660915707393-CollectionTopBidEvents";
import { CryptopunksOrderKind1661262626757 } from "./migration/1661262626757-CryptopunksOrderKind";
import { MintOrderKind1661349033870 } from "./migration/1661349033870-MintOrderKind";
import { OrderEventsNonce1661583101441 } from "./migration/1661583101441-OrderEventsNonce";
import { Fill1661781745682 } from "./migration/1661781745682-Fill";
import { UniverseOrderKind1661847955331 } from "./migration/1661847955331-UniverseOrderKind";
import { SalesIsPrimary1662100601103 } from "./migration/1662100601103-SalesIsPrimary";
import { SudoswapOrderKind1662382158706 } from "./migration/1662382158706-SudoswapOrderKind";
import { TransactionTraces1662382253823 } from "./migration/1662382253823-TransactionTraces";
import { SudoswapPools1662385509745 } from "./migration/1662385509745-SudoswapPools";
import { NftxOrderKind1662461545909 } from "./migration/1662461545909-NftxOrderKind";
import { NftxPools1662461589902 } from "./migration/1662461589902-NftxPools";
import { TransactionLogs1662462929056 } from "./migration/1662462929056-TransactionLogs";
import { ApiKeys1662748267056 } from "./migration/1662748267056-ApiKeys";
import { RateLimits1662748267056 } from "./migration/1662748267056-RateLimits";
import { CryptopunksContractKind1662976890815 } from "./migration/1662976890815-CryptopunksContractKind";
import { CollectionsNewRoyalties1663842912476 } from "./migration/1663842912476-CollectionsNewRoyalties";
import { SourcesDomainHash1663913172040 } from "./migration/1663913172040-SourcesDomainHash";
import { FlaggedAddresses1664467735775 } from "./migration/1664467735775-FlaggedAddresses";
import { ApiKeyPermissions1664821582318 } from "./migration/1664821582318-ApiKeyPermissions";
import { ActivitiesOrderId1664906169169 } from "./migration/1664906169169-ActivitiesOrderId";
import { SourcesOptimized1665073589748 } from "./migration/1665073589748-SourcesOptimized";
import { Collections1665176096587 } from "./migration/1665176096587-Collections";
import { BlurOrderKind1666210035775 } from "./migration/1666210035775-BlurOrderKind";
import { Daily1666629909794 } from "./migration/1666629909794-Daily";
import { Tokens1666720715123 } from "./migration/1666720715123-Tokens";
import { ForwardOrderKind1666776739846 } from "./migration/1666776739846-ForwardOrderKind";
import { OrdersMissingRoyalties1667287245049 } from "./migration/1667287245049-OrdersMissingRoyalties";
import { OrdersNormalizedValue1667811460235 } from "./migration/1667811460235-OrdersNormalizedValue";
import { OrdersCurrencyNormalizedValue1667837757239 } from "./migration/1667837757239-OrdersCurrencyNormalizedValue";
import { InfinityOrderKind1667928675738 } from "./migration/1667928675738-InfinityOrderKind";
import { OpenseaWebsocketEvents1668531515142 } from "./migration/1668531515142-OpenseaWebsocketEvents";
import { AddManifold1668589095839 } from "./migration/1668589095839-AddManifold";
import { Fills1668671480626 } from "./migration/1668671480626-Fills";
import { TokenNormalized1669056408397 } from "./migration/1669056408397-TokenNormalized";
import { CollectionNormalized1669081936761 } from "./migration/1669081936761-CollectionNormalized";
import { CollectionsNewRoyaltiesFeeBps1669223620476 } from "./migration/1669223620476-CollectionsNewRoyaltiesFeeBps";
import { CollectionsRoyaltiesFeeBps1669655080476 } from "./migration/1669655080476-CollectionsRoyaltiesFeeBps";
import { FixCollectionFloorSellEvents1669658447580 } from "./migration/1669658447580-FixCollectionFloorSellEvents";
import { FixCollectionEventTables1669659252253 } from "./migration/1669659252253-FixCollectionEventTables";
import { AddCryptokittiesContractKind1669967716333 } from "./migration/1669967716333-AddCryptokittiesContractKind";
import { Tokens1669990797123 } from "./migration/1669990797123-Tokens";
import { CollectionNonFlaggedFloorSellEvents1670005999929 } from "./migration/1670005999929-CollectionNonFlaggedFloorSellEvents";
import { FixCollectionNonFlaggedFloorSellEvents1670240474436 } from "./migration/1670240474436-FixCollectionNonFlaggedFloorSellEvents";
import { Mq1670355091123 } from "./migration/1670355091123-Mq";
import { AddNftTraderOrderKind1670507838754 } from "./migration/1670507838754-AddNftTraderOrderKind";
import { AddTofuOrderKind1670830412919 } from "./migration/1670830412919-AddTofuOrderKind";
import { AddErc721LikeContractKind1670834633046 } from "./migration/1670834633046-AddErc721LikeContractKind";
import { AddDataExportTasksTarget1670875777097 } from "./migration/1670875777097-AddDataExportTasksTarget";
import { UpdateDataExportTasks1670893563657 } from "./migration/1670893563657-UpdateDataExportTasks";
import { AddDecentralandOrderKind1670917593461 } from "./migration/1670917593461-AddDecentralandOrderKind";
import { AddOkexOrderKind1671178196392 } from "./migration/1671178196392-AddOkexOrderKind";
import { AddBendDaoOrderKindCopy1671189653542 } from "./migration/1671189653542-AddBendDaoOrderKindCopy";
import { AddSuperrareOrderKind1671437869591 } from "./migration/1671437869591-AddSuperrareOrderKind";
import { Remove1671463565183 } from "./migration/1671463565183-Remove";
import { Add0XV2OrderKind1671633521422 } from "./migration/1671633521422-Add0XV2OrderKind";
import { Contracts1671634891827 } from "./migration/1671634891827-Contracts";
import { NftBalancesLastSaleValue1672419164815 } from "./migration/1672419164815-NftBalancesLastSaleValue";
import { NftBalancesLastTokenAppraisalValue1672795373202 } from "./migration/1672795373202-NftBalancesLastTokenAppraisalValue";
import { NftTransfersCreatedAt1673372449340 } from "./migration/1673372449340-NftTransfersCreatedAt";
import { SourcesCreatedAt1673372449341 } from "./migration/1673372449341-SourcesCreatedAt";
import { Routers1673523143573 } from "./migration/1673523143573-Routers";
import { FillsNetAmount1674021078048 } from "./migration/1674021078048-FillsNetAmount";
import { FlowOrderKind1674242825314 } from "./migration/1674242825314-FlowOrderKind";
import { OrdersOriginatedAt1675236258489 } from "./migration/1675236258489-OrdersOriginatedAt";
import { OrdersOnChainData1675253954468 } from "./migration/1675253954468-OrdersOnChainData";
import { SeaportV12OrderKind1675345304827 } from "./migration/1675345304827-SeaportV12OrderKind";
import { OrderEventsRawData1676471038531 } from "./migration/1676471038531-OrderEventsRawData";
import { SeaportV13OrderKind1676657999353 } from "./migration/1676657999353-SeaportV13OrderKind";
import { RateLimits1676664167056 } from "./migration/1676664167056-RateLimits";
import { SeaportV14OrderKind1677090460841 } from "./migration/1677090460841-SeaportV14OrderKind";
import { CrossPostingOrders1677272845394 } from "./migration/1677272845394-CrossPostingOrders";
import { CollectionsMarketplaceFees1678735936581 } from "./migration/1678735936581-CollectionsMarketplaceFees";
import { ApiUsage1679063194581 } from "./migration/1679063194581-ApiUsage";
import { ContractsFilteredOperators1680055939007 } from "./migration/1680055939007-ContractsFilteredOperators";
import { TreasureOrderKind1680248619158 } from "./migration/1680248619158-TreasureOrderKind";
import { Add0XV3OrderKind1680530058943 } from "./migration/1680530058943-Add0XV3OrderKind";
import { LooksRareV2OrderKindNew1680570377130 } from "./migration/1680570377130-LooksRareV2OrderKindNew";
import { AddBulkCancelEventsSide1680570377133 } from "./migration/1680570377133-AddBulkCancelEventsSide";
import { LooksrareV2SubsetNonces1680570377136 } from "./migration/1680570377136-LooksrareV2SubsetNonces";
import { AddAlienswapOrderKind1680587022129 } from "./migration/1680587022129-AddAlienswapOrderKind";
import { CancelEventsCreatedAt1682373331544 } from "./migration/1682373331544-CancelEventsCreatedAt";
import { AddNftxFtPoolsPoolKind1682407871536 } from "./migration/1682407871536-AddNftxFtPoolsPoolKind";
import { CollectionPools1682410320474 } from "./migration/1682410320474-CollectionPools";
import { Executions1682512844378 } from "./migration/1682512844378-Executions";
import { TokensSupply1682624868123 } from "./migration/1682624868123-TokensSupply";
import { SeaportV15OrderKind1682762260264 } from "./migration/1682762260264-SeaportV15OrderKind";
import { ApiKeys1683207736056 } from "./migration/1683207736056-ApiKeys";
import { RoutesPoints1683565791581 } from "./migration/1683565791581-RoutesPoints";
import { MethodSignatures1684399749881 } from "./migration/1684399749881-MethodSignatures";
import { CollectionMints1684431232190 } from "./migration/1684431232190-CollectionMints";
import { CollectionsOwnersCount1684443851969 } from "./migration/1684443851969-CollectionsOwnersCount";
import { BlendOrderKind1684480187533 } from "./migration/1684480187533-BlendOrderKind";
import { CollectionMintsNewFields1684763260050 } from "./migration/1684763260050-CollectionMintsNewFields";
import { SudoswapV2Pools1685063598297 } from "./migration/1685063598297-SudoswapV2Pools";
import { SudoswapV2OrderKind1685348982093 } from "./migration/1685348982093-SudoswapV2OrderKind";
import { TokensMetadata1685459891870 } from "./migration/1685459891870-TokensMetadata";
import { RateLimits1685468560056 } from "./migration/1685468560056-RateLimits";
import { RoutesPoints1685469044581 } from "./migration/1685469044581-RoutesPoints";
import { Collections1686255947145 } from "./migration/1686255947145-Collections";
import { ExecutionResults1686638296360 } from "./migration/1686638296360-ExecutionResults";
import { SeaportConduitOpenChannels1686645629521 } from "./migration/1686645629521-SeaportConduitOpenChannels";
import { CollectionMintsImprovements1686740313110 } from "./migration/1686740313110-CollectionMintsImprovements";
import { CollectionMintsImprovementsFixes1686909398072 } from "./migration/1686909398072-CollectionMintsImprovementsFixes";
import { CollectionMintsManifold1686917974468 } from "./migration/1686917974468-CollectionMintsManifold";
import { CollectionMintsThirdweb1687177909940 } from "./migration/1687177909940-CollectionMintsThirdweb";
import { PaymentProcessorOrderKind1687334670341 } from "./migration/1687334670341-PaymentProcessorOrderKind";
import { Orders1687372721129 } from "./migration/1687372721129-Orders";
import { CollectionMintsAllowlists1687388299110 } from "./migration/1687388299110-CollectionMintsAllowlists";
import { CollectionMintsImprovements1687443317656 } from "./migration/1687443317656-CollectionMintsImprovements";
import { CollectionMintsImprovements1687452638781 } from "./migration/1687452638781-CollectionMintsImprovements";
import { CaviarV1OrderKind1687538939079 } from "./migration/1687538939079-CaviarV1OrderKind";
import { Remove1687807405789 } from "./migration/1687807405789-Remove";
import { MidaswapOrderKind1687936565390 } from "./migration/1687936565390-MidaswapOrderKind";
import { MidaswapPools1687936565391 } from "./migration/1687936565391-MidaswapPools";
import { CollectionMintsDecent1688388011952 } from "./migration/1688388011952-CollectionMintsDecent";
import { CollectionMints1688575181952 } from "./migration/1688575181952-CollectionMints";
import { CollectionMints1688582441952 } from "./migration/1688582441952-CollectionMints";
import { BlurV2OrderKind1688621662665 } from "./migration/1688621662665-BlurV2OrderKind";
import { Alter1689087567231 } from "./migration/1689087567231-Alter";
import { Collections1689189895587 } from "./migration/1689189895587-Collections";
import { Alter1689693778644 } from "./migration/1689693778644-Alter";
import { Tokens1689773461587 } from "./migration/1689773461587-Tokens";
import { FeeRecipients1689907665189 } from "./migration/1689907665189-FeeRecipients";
import { CollectionMintsFoundation1690026722375 } from "./migration/1690026722375-CollectionMintsFoundation";
import { Erc721CConfigs1691453552311 } from "./migration/1691453552311-Erc721CConfigs";
import { Slug1691984447123 } from "./migration/1691984447123-Slug";
import { JoepegOrderKind1692261985139 } from "./migration/1692261985139-JoepegOrderKind";
import { Fills1692342719699 } from "./migration/1692342719699-Fills";
import { CollectionMintsLanyard1692976429493 } from "./migration/1692976429493-CollectionMintsLanyard";
import { CollectionMintsMintdotfun1693371918639 } from "./migration/1693371918639-CollectionMintsMintdotfun";
import { Contracts1693540314231 } from "./migration/1693540314231-Contracts";
import { TokensTimeToMetadata1693595278218 } from "./migration/1693595278218-TokensTimeToMetadata";
import { Collections1695661231254 } from "./migration/1695661231254-Collections";
import { Drop1695661231254 } from "./migration/1695661231254-Drop";
import { CollectionMintsSoundxyz1697213056624 } from "./migration/1697213056624-CollectionMintsSoundxyz";
import { CollectionMintsCreatedotfun1697469705537 } from "./migration/1697469705537-CollectionMintsCreatedotfun";

export const AppDataSource = new DataSource({
  type: "postgres",
  url: config.databaseUrl,
  synchronize: false,
  logging: true,
  migrationsTableName: "typeorm_migrations",
  entities: [
    Allowlists,
    AllowlistsItems,
    ApiKeys,
    AttributeKeys,
    Attributes,
    BidEvents,
    Blocks,
    BulkCancelEvents,
    BundleItems,
    Bundles,
    CancelEvents,
    CollectionFloorSellEvents,
    CollectionMintStandards,
    CollectionMints,
    CollectionNonFlaggedFloorSellEvents,
    CollectionNormalizedFloorSellEvents,
    CollectionTopBidEvents,
    Collections,
    CollectionsSets,
    CollectionsSetsCollections,
    CollectionxyzPools,
    Contracts,
    ContractsSets,
    ContractsSetsContracts,
    CrossPostingOrders,
    Currencies,
    DailyApiUsage,
    DailyVolumes,
    DataExportTasks,
    Erc721cConfigs,
    Erc721cOperatorWhitelists,
    Erc721cPermittedContractReceiverAllowlists,
    Erc721cVerifiedEoas,
    ExecutionResults,
    Executions,
    FeeRecipients,
    FillEvents_2,
    FtApprovals,
    FtBalances,
    FtTransferEvents,
    HourlyApiUsage,
    LooksrareV2SubsetNonceCancelEvents,
    MethodSignatures,
    MidaswapPools,
    MonthlyApiUsage,
    MqJobsData,
    NftApprovalEvents,
    NftBalances,
    NftTransferEvents,
    NftxFtPools,
    NftxNftPools,
    NonceCancelEvents,
    OrderEvents,
    Orders,
    Pgmigrations,
    RateLimitRules,
    RemovedAttributeKeys,
    RemovedAttributes,
    RemovedTokenAttributes,
    Routers,
    SeaportConduitOpenChannels,
    Sources,
    SourcesV2,
    SudoswapPools,
    SudoswapV2Pools,
    TokenAttributes,
    TokenFloorSellEvents,
    TokenNormalizedFloorSellEvents,
    TokenSets,
    TokenSetsTokens,
    Tokens,
    TransactionLogs,
    TransactionTraces,
    Transactions,
    UsdPrices,
    WyvernProxies,
  ],
  migrations: [
    Contracts1643714045649,
    Tokens1643714286947,
    Transfers1643714475176,
    Balances1643716513646,
    TokenSets1643803474513,
    Orders1643809164129,
    Cancels1643809164130,
    Collections1644406305587,
    Fills1644930748093,
    BulkCancels1645184399776,
    ApiKeys1645443452270,
    Approvals1645692953082,
    DailyVolumes1645976283000,
    TokenFloorSellEvents1646061361108,
    Attributes1646736672602,
    NonceCancels1648551570381,
    Sources1648833416270,
    Sources1648833417270,
    DailyVolumesAdditions1649749835254,
    CollectionFloorSellEvents1650270396016,
    OrderEvents1650352850828,
    Collections1652455437828,
    Activities1652729912828,
    UserActivities1653599990214,
    Transactions1654498276444,
    Blocks1654505890174,
    FtApprovals1654533259333,
    DataExportTasks1655818401898,
    Removed1655836381302,
    Bundles1657111173185,
    ImprovedTransactions1657788711516,
    ImprovedBlocks1657805402797,
    ImprovedFills1658816965601,
    WashTradingScore1658932920910,
    ElementOrderKind1659029948930,
    RaribleOrderKind1659101094534,
    CurrenciesAndPrices1659435546006,
    QuixoticOrderKind1659596160207,
    ZoraOrderKind1659625683558,
    Tokens1659729455123,
    BidEvents1660053361963,
    Collections1660056506587,
    OrderCurrency1660812104602,
    CollectionTopBidEvents1660915707393,
    CryptopunksOrderKind1661262626757,
    MintOrderKind1661349033870,
    OrderEventsNonce1661583101441,
    Fill1661781745682,
    UniverseOrderKind1661847955331,
    SalesIsPrimary1662100601103,
    SudoswapOrderKind1662382158706,
    TransactionTraces1662382253823,
    SudoswapPools1662385509745,
    NftxOrderKind1662461545909,
    NftxPools1662461589902,
    TransactionLogs1662462929056,
    ApiKeys1662748267056,
    RateLimits1662748267056,
    CryptopunksContractKind1662976890815,
    CollectionsNewRoyalties1663842912476,
    SourcesDomainHash1663913172040,
    FlaggedAddresses1664467735775,
    ApiKeyPermissions1664821582318,
    ActivitiesOrderId1664906169169,
    SourcesOptimized1665073589748,
    Collections1665176096587,
    BlurOrderKind1666210035775,
    Daily1666629909794,
    Tokens1666720715123,
    ForwardOrderKind1666776739846,
    OrdersMissingRoyalties1667287245049,
    OrdersNormalizedValue1667811460235,
    OrdersCurrencyNormalizedValue1667837757239,
    InfinityOrderKind1667928675738,
    OpenseaWebsocketEvents1668531515142,
    AddManifold1668589095839,
    Fills1668671480626,
    TokenNormalized1669056408397,
    CollectionNormalized1669081936761,
    CollectionsNewRoyaltiesFeeBps1669223620476,
    CollectionsRoyaltiesFeeBps1669655080476,
    FixCollectionFloorSellEvents1669658447580,
    FixCollectionEventTables1669659252253,
    AddCryptokittiesContractKind1669967716333,
    Tokens1669990797123,
    CollectionNonFlaggedFloorSellEvents1670005999929,
    FixCollectionNonFlaggedFloorSellEvents1670240474436,
    Mq1670355091123,
    AddNftTraderOrderKind1670507838754,
    AddTofuOrderKind1670830412919,
    AddErc721LikeContractKind1670834633046,
    AddDataExportTasksTarget1670875777097,
    UpdateDataExportTasks1670893563657,
    AddDecentralandOrderKind1670917593461,
    AddOkexOrderKind1671178196392,
    AddBendDaoOrderKindCopy1671189653542,
    AddSuperrareOrderKind1671437869591,
    Remove1671463565183,
    Add0XV2OrderKind1671633521422,
    Contracts1671634891827,
    NftBalancesLastSaleValue1672419164815,
    NftBalancesLastTokenAppraisalValue1672795373202,
    NftTransfersCreatedAt1673372449340,
    SourcesCreatedAt1673372449341,
    Routers1673523143573,
    FillsNetAmount1674021078048,
    FlowOrderKind1674242825314,
    OrdersOriginatedAt1675236258489,
    OrdersOnChainData1675253954468,
    SeaportV12OrderKind1675345304827,
    OrderEventsRawData1676471038531,
    SeaportV13OrderKind1676657999353,
    RateLimits1676664167056,
    SeaportV14OrderKind1677090460841,
    CrossPostingOrders1677272845394,
    CollectionsMarketplaceFees1678735936581,
    ApiUsage1679063194581,
    ContractsFilteredOperators1680055939007,
    TreasureOrderKind1680248619158,
    Add0XV3OrderKind1680530058943,
    LooksRareV2OrderKindNew1680570377130,
    AddBulkCancelEventsSide1680570377133,
    LooksrareV2SubsetNonces1680570377136,
    AddAlienswapOrderKind1680587022129,
    CancelEventsCreatedAt1682373331544,
    AddNftxFtPoolsPoolKind1682407871536,
    CollectionPools1682410320474,
    Executions1682512844378,
    TokensSupply1682624868123,
    SeaportV15OrderKind1682762260264,
    ApiKeys1683207736056,
    RoutesPoints1683565791581,
    MethodSignatures1684399749881,
    CollectionMints1684431232190,
    CollectionsOwnersCount1684443851969,
    BlendOrderKind1684480187533,
    CollectionMintsNewFields1684763260050,
    SudoswapV2Pools1685063598297,
    SudoswapV2OrderKind1685348982093,
    TokensMetadata1685459891870,
    RateLimits1685468560056,
    RoutesPoints1685469044581,
    Collections1686255947145,
    ExecutionResults1686638296360,
    SeaportConduitOpenChannels1686645629521,
    CollectionMintsImprovements1686740313110,
    CollectionMintsImprovementsFixes1686909398072,
    CollectionMintsManifold1686917974468,
    CollectionMintsThirdweb1687177909940,
    PaymentProcessorOrderKind1687334670341,
    Orders1687372721129,
    CollectionMintsAllowlists1687388299110,
    CollectionMintsImprovements1687443317656,
    CollectionMintsImprovements1687452638781,
    CaviarV1OrderKind1687538939079,
    Remove1687807405789,
    MidaswapOrderKind1687936565390,
    MidaswapPools1687936565391,
    CollectionMintsDecent1688388011952,
    CollectionMints1688575181952,
    CollectionMints1688582441952,
    BlurV2OrderKind1688621662665,
    Alter1689087567231,
    Collections1689189895587,
    Alter1689693778644,
    Tokens1689773461587,
    FeeRecipients1689907665189,
    CollectionMintsFoundation1690026722375,
    Erc721CConfigs1691453552311,
    Slug1691984447123,
    JoepegOrderKind1692261985139,
    Fills1692342719699,
    CollectionMintsLanyard1692976429493,
    CollectionMintsMintdotfun1693371918639,
    Contracts1693540314231,
    TokensTimeToMetadata1693595278218,
    Collections1695661231254,
    Drop1695661231254,
    CollectionMintsSoundxyz1697213056624,
    CollectionMintsCreatedotfun1697469705537,
  ],
  subscribers: [],
});
