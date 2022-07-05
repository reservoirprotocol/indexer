export const config = {
  version: String(process.env.VERSION),
  port: Number(process.env.PORT),
  chainId: Number(process.env.CHAIN_ID),

  adminApiKey: String(process.env.ADMIN_API_KEY),
  arweaveRelayerKey: process.env.ARWEAVE_RELAYER_KEY
    ? String(process.env.ARWEAVE_RELAYER_KEY)
    : undefined,
  oraclePrivateKey: process.env.ORACLE_PRIVATE_KEY
    ? String(process.env.ORACLE_PRIVATE_KEY)
    : undefined,

  baseNetworkHttpUrl: String(process.env.BASE_NETWORK_HTTP_URL),
  baseNetworkWsUrl: String(process.env.BASE_NETWORK_WS_URL),
  slowNetworkHttpUrl: String(
    process.env.SLOW_NETWORK_HTTP_URL ?? process.env.BASE_NETWORK_HTTP_URL
  ),
  openseaIndexerApiBaseUrl: String(process.env.OPENSEA_INDEXER_API_BASE_URL),

  // When running in liquidity-only mode, all metadata processes are disabled
  liquidityOnly: !process.env.METADATA_API_BASE_URL,
  metadataIndexingMethod: String(process.env.METADATA_INDEXING_METHOD || "opensea"),
  metadataApiBaseUrl: String(process.env.METADATA_API_BASE_URL),

  databaseUrl: String(process.env.DATABASE_URL),
  readReplicaDatabaseUrl: String(process.env.READ_REPLICA_DATABASE_URL || process.env.DATABASE_URL),
  writeReplicaDatabaseUrl: String(
    process.env.WRITE_REPLICA_DATABASE_URL || process.env.DATABASE_URL
  ),
  redisUrl: String(process.env.REDIS_URL),

  master: Boolean(Number(process.env.MASTER)),
  catchup: Boolean(Number(process.env.CATCHUP)),
  doBackgroundWork: Boolean(Number(process.env.DO_BACKGROUND_WORK)),
  disableOrders: Boolean(Number(process.env.DISABLE_ORDERS)),

  maxItemsPerBid: 50000,

  awsAccessKeyId: String(process.env.AWS_ACCESS_KEY_ID),
  awsSecretAccessKey: String(process.env.AWS_SECRET_ACCESS_KEY),

  dataExportS3BucketName: String(process.env.DATA_EXPORT_S3_BUCKET_NAME),
  dataExportAwsAccessRole: String(process.env.DATA_EXPORT_AWS_ACCESS_ROLE),
  dataExportAwsS3UploadRole: String(process.env.DATA_EXPORT_AWS_S3_UPLOAD_ROLE),
  dataExportAwsS3UploadExternalId: String(process.env.DATA_EXPORT_AWS_S3_UPLOAD_EXTERNAL_ID),
};
