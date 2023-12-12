export const config = {
  version: String(process.env.VERSION),
  port: Number(process.env.PORT),
  chainId: Number(process.env.CHAIN_ID),
  environment: String(process.env.ENVIRONMENT),

  adminApiKey: String(process.env.ADMIN_API_KEY),
  bullmqAdminPassword: String(process.env.BULLMQ_ADMIN_PASSWORD),
  arweaveRelayerKey: process.env.ARWEAVE_RELAYER_KEY
    ? String(process.env.ARWEAVE_RELAYER_KEY)
    : undefined,
  oraclePrivateKey: String(process.env.ORACLE_PRIVATE_KEY),
  oracleAwsKmsKeyId: String(process.env.ORACLE_AWS_KMS_KEY_ID),
  oracleAwsKmsKeyRegion: String(process.env.ORACLE_AWS_KMS_KEY_REGION),

  baseNetworkHttpUrl: String(process.env.BASE_NETWORK_HTTP_URL),
  baseNetworkWsUrl: String(process.env.BASE_NETWORK_WS_URL),

  openseaIndexerApiBaseUrl: String(process.env.OPENSEA_INDEXER_API_BASE_URL),

  // When running in liquidity-only mode, all metadata processes are disabled
  liquidityOnly: Boolean(Number(process.env.LIQUIDITY_ONLY)),
  metadataIndexingMethod: String(process.env.METADATA_INDEXING_METHOD || "opensea"),
  metadataMaxFieldSizeMB: Number(process.env.METADATA_MAX_FIELD_SIZE_MB || 1),
  fallbackMetadataIndexingMethod: process.env.FALLBACK_METADATA_INDEXING_METHOD || undefined,
  metadataIndexingMethodCollection: String(
    process.env.METADATA_INDEXING_METHOD_COLLECTION ||
      process.env.METADATA_INDEXING_METHOD ||
      "opensea"
  ),
  disableFlagStatusRefreshJob: Boolean(Number(process.env.DISABLE_FLAG_STATUS_REFRESH_JOB)),

  disableRealtimeMetadataRefresh: Boolean(Number(process.env.DISABLE_REALTIME_METADATA_REFRESH)),

  databaseUrl: String(process.env.DATABASE_URL),
  disableDatabaseStatementTimeout: Boolean(Number(process.env.DATABASE_DISABLE_STATEMENT_TIMEOUT)),
  readReplicaDatabaseUrl: String(process.env.READ_REPLICA_DATABASE_URL || process.env.DATABASE_URL),
  writeReplicaDatabaseUrl: String(
    process.env.WRITE_REPLICA_DATABASE_URL || process.env.DATABASE_URL
  ),
  redisUrl: String(process.env.REDIS_URL),
  rateLimitRedisUrl: String(process.env.RATE_LIMIT_REDIS_URL || process.env.REDIS_URL),
  redisWebsocketUrl: String(process.env.REDIS_WEBSOCKET_URL || process.env.REDIS_URL),
  metricsRedisUrl: String(process.env.METRICS_REDIS_URL || process.env.REDIS_URL),
  allChainsSyncRedisUrl: String(process.env.ALL_CHAINS_SYNC_REDIS_URL || process.env.REDIS_URL),
  redshiftUrl: String(process.env.REDSHIFT_URL),

  master: Boolean(Number(process.env.MASTER)),
  catchup: Boolean(Number(process.env.CATCHUP)),
  doBackgroundWork: Boolean(Number(process.env.DO_BACKGROUND_WORK)),
  doWebsocketWork: Boolean(Number(process.env.DO_WEBSOCKET_WORK)),
  doWebsocketServerWork: Boolean(Number(process.env.DO_WEBSOCKET_SERVER_WORK)),
  doEventsSyncBackfill: Boolean(Number(process.env.DO_EVENTS_SYNC_BACKFILL)),
  disableOrders: Boolean(Number(process.env.DISABLE_ORDERS)),

  // for kafka
  doKafkaWork: Boolean(Number(process.env.DO_KAFKA_WORK)),
  kafkaPartitionsConsumedConcurrently: Number(process.env.KAFKA_PARTITIONS_CONSUMED_CONCURRENTLY),
  kafkaConsumerGroupId: String(process.env.KAFKA_CONSUMER_GROUP_ID),
  kafkaBrokers: process.env.KAFKA_BROKERS ? String(process.env.KAFKA_BROKERS).split(",") : [],
  kafkaClientId: String(process.env.KAFKA_CLIENT_ID),
  kafkaMaxBytesPerPartition: Number(process.env.KAFKA_MAX_BYTES_PER_PARTITION),

  maxTokenSetSize: 100000,

  awsAccessKeyId: String(process.env.AWS_ACCESS_KEY_ID || process.env.FC_AWS_ACCESS_KEY_ID),
  awsSecretAccessKey: String(
    process.env.AWS_SECRET_ACCESS_KEY || process.env.FC_AWS_SECRET_ACCESS_KEY
  ),

  dataExportS3BucketName: String(process.env.DATA_EXPORT_S3_BUCKET_NAME),
  dataExportAwsAccessRole: String(process.env.DATA_EXPORT_AWS_ACCESS_ROLE),
  dataExportAwsS3UploadRole: String(process.env.DATA_EXPORT_AWS_S3_UPLOAD_ROLE),
  dataExportAwsS3UploadExternalId: String(process.env.DATA_EXPORT_AWS_S3_UPLOAD_EXTERNAL_ID),
  dataExportS3ArchiveBucketName: process.env.DATA_EXPORT_S3_ARCHIVE_BUCKET_NAME
    ? String(process.env.DATA_EXPORT_S3_ARCHIVE_BUCKET_NAME)
    : undefined,

  // For forwarding orders to OpenSea
  forwardOpenseaApiKey: String(process.env.FORWARD_OPENSEA_API_KEY),
  forwardReservoirApiKeys: process.env.FORWARD_RESERVOIR_API_KEYS
    ? (JSON.parse(process.env.FORWARD_RESERVOIR_API_KEYS) as string[])
    : [],

  alchemyApiKey: String(process.env.ALCHEMY_API_KEY),
  looksRareApiKey: String(process.env.LOOKSRARE_API_KEY),
  openSeaApiKey: String(process.env.OPENSEA_API_KEY),
  openSeaApiUrl: String(process.env.OPENSEA_API_URL || ""),

  // Cosigner
  cosignerPrivateKey: String(process.env.COSIGNER_PRIVATE_KEY),

  // Solvers
  crossChainSolverBaseUrl: process.env.CROSS_CHAIN_SOLVER_BASE_URL,
  seaportSolverBaseUrl: process.env.SEAPORT_SOLVER_BASE_URL,

  // Custom taker (used for simulation)
  customTakerPrivateKey: process.env.CUSTOM_TAKER_PRIVATE_KEY,

  openSeaTokenMetadataApiKey: String(
    process.env.OPENSEA_TOKENS_API_KEY || process.env.OPENSEA_API_KEY
  ),
  openSeaTokenMetadataBySlugApiKey: String(
    process.env.OPENSEA_SLUG_API_KEY ||
      process.env.OPENSEA_TOKENS_API_KEY ||
      process.env.OPENSEA_API_KEY
  ),
  openSeaCollectionMetadataApiKey: String(
    process.env.OPENSEA_COLLECTION_API_KEY ||
      process.env.OPENSEA_TOKENS_API_KEY ||
      process.env.OPENSEA_API_KEY
  ),
  openSeaTokenFlagStatusApiKey: String(
    process.env.OPENSEA_TOKEN_FLAG_STATUS_API_KEY ||
      process.env.OPENSEA_TOKENS_API_KEY ||
      process.env.OPENSEA_API_KEY
  ),

  openSeaCrossPostingApiKey: String(
    process.env.OPENSEA_CROSS_POSTING_API_KEY || process.env.OPENSEA_API_KEY
  ),

  simplehashApiKey: String(process.env.SIMPLEHASH_API_KEY),

  soundxyzApiKey: String(process.env.SOUNDXYZ_API_KEY),
  soundxyzUserAgent: String(process.env.SOUNDXYZ_USER_AGENT),

  ordinalsApiKey: String(process.env.ORDINALS_API_KEY),

  enableImageResizing: Boolean(Number(process.env.ENABLE_IMAGE_RESIZING)),
  privateImageResizingSigningKey: String(process.env.PRIVATE_IMAGE_RESIZING_SIGNING_KEY),
  imageResizingBaseUrl: String(process.env.IMAGE_RESIZING_BASE_URL),

  x2y2ApiKey: String(process.env.X2Y2_API_KEY),
  cbApiKey: String(process.env.CB_API_KEY),
  orderFetcherApiKey: String(process.env.ORDER_FETCHER_API_KEY),

  blurWsApiKey: process.env.BLUR_WS_API_KEY,
  blurWsUrl: process.env.BLUR_WS_URL,
  blurWsListingsUrl: process.env.BLUR_LISTINGS_WS_URL,

  orderFetcherBaseUrl: String(process.env.ORDER_FETCHER_BASE_URL),

  cipherSecret: String(process.env.CIPHER_SECRET),
  imageTag: String(process.env.IMAGE_TAG),

  slackApiKeyWebhookUrl: String(process.env.SLACK_API_KEY_WEBHOOK_URL),

  maxParallelTokenRefreshJobs: Number(process.env.MAX_PARALLEL_TOKEN_REFRESH_JOBS || 1),
  maxParallelTokenCollectionSlugRefreshJobs: Number(
    process.env.MAX_PARALLEL_TOKEN_COLLECTION_SLUG_REFRESH_JOBS || 1
  ),

  enableDebug: Boolean(Number(process.env.ENABLE_DEBUG)),

  // Elasticsearch
  elasticsearchUrl: String(process.env.ELASTICSEARCH_URL || ""),
  doElasticsearchWork: Boolean(Number(process.env.DO_ELASTICSEARCH_WORK)),
  enableElasticsearchAsks: Boolean(Number(process.env.ENABLE_ELASTICSEARCH_ASKS)),

  // RabbitMq
  rabbitHttpUrl: `http://${String(process.env.RABBIT_USERNAME)}:${String(
    process.env.RABBIT_PASSWORD
  )}@${String(process.env.RABBIT_HOSTNAME)}:15672`,
  rabbitHostname: String(process.env.RABBIT_HOSTNAME),
  rabbitUsername: String(process.env.RABBIT_USERNAME),
  rabbitPassword: String(process.env.RABBIT_PASSWORD),
  assertRabbitVhost: Boolean(Number(process.env.ASSERT_RABBIT_VHOST)),
  rabbitDisableQueuesConsuming: Boolean(Number(process.env.RABBIT_DISABLE_QUEUES_CONSUMING)),
  forceEnableRabbitJobsConsumer: Boolean(Number(process.env.FORCE_ENABLE_RABBIT_JOBS_CONSUMER)),
};
