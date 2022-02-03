# Reservoir Protocol Indexer
 
Core services for the Reservoir Protocol (eg. blockchain indexing/monitoring, orderbook maintenance, order validation).

### Build and run

To run, the service needs to have available a Postgres and Redis instance. For running locally, these are conveniently provided via `docker-compose`. Boot them up by running `docker-compose up` in the root directory.

Install dependencies via `yarn`. Build and start the service via `yarn build` and `yarn start`. Make sure to have a `.env` file in the root directory containing the environment variables needed to run the service (which are exemplified in `.env.example`).

### Setup

When starting from a fresh state, the indexer will start monitoring on-chain data from the current block. This means that past data is not available directly but must be backfilled. For now, the backfills are to be triggered via the indexer's admin APIs.
