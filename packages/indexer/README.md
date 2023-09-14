# Reservoir Protocol Indexer

Core Reservoir Protocol services (eg. blockchain indexing/monitoring, orderbook maintenance, order validation).

### Build and run

To run, the service needs to have available a Postgres and Redis instance. For running locally, these are conveniently provided via `docker-compose`. Boot them up by running `docker-compose up` in the root directory.

Install dependencies via `yarn`. Build and start the service via `yarn build` and `yarn start`. Make sure to have a `.env` file in the root directory containing the environment variables needed to run the service (which are exemplified in `.env.example`).

### Setup

When starting from a fresh state, the indexer will begin monitoring on-chain data from the current block. This means that past data is not available directly but must be backfilled. Since order validation depends on past data (eg. balances and approvals) it should be disabled until the indexer is fully backfilled. The backfilling process can be triggered via a simple admin API call:

```
POST /admin/sync-events
{
	"fromBlock": FROM_BLOCK,
	"toBlock": TO_BLOCK
}
```

It's recommended to perform the backfill in batches rather than all at once in order to not bottleneck the system (eg. 4-5 calls each for a batch of 200.000 - 300.000 blocks). Also, when the backfill is on-going it might be worthwhile to drop various indexes to speed up writes (when the backfill is finalized, the dropped indexes can easily be reconstructed concurrently).
