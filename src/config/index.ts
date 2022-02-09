export const config = {
  version: String(process.env.VERSION),
  port: Number(process.env.PORT),
  chainId: Number(process.env.CHAIN_ID),

  adminApiKey: String(process.env.ADMIN_API_KEY),
  arweaveRelayerKey: String(process.env.ARWEAVE_RELAYER_KEY),
  etherscanApiKey: String(process.env.ETHERSCAN_API_KEY),

  metadataApiBaseUrl: String(process.env.METADATA_API_BASE_URL),
  baseNetworkHttpUrl: String(process.env.BASE_NETWORK_HTTP_URL),
  baseNetworkWsUrl: String(process.env.BASE_NETWORK_WS_URL),

  databaseUrl: String(process.env.DATABASE_URL),
  redisUrl: String(process.env.REDIS_URL),

  master: Boolean(Number(process.env.MASTER)),
  acceptOrders: Boolean(Number(process.env.ACCEPT_ORDERS)),
  doBackgroundWork: Boolean(Number(process.env.DO_BACKGROUND_WORK)),
};
