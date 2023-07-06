// There are many processes we might want to execute in regards
// to token state changes. For example, we might want to handle
// burns in a special way or make sure the token will associate
// to a collection when it gets minted.

import "@/jobs/token-updates/mint-queue";
import "@/jobs/token-updates/token-refresh-cache";
import "@/jobs/token-updates/fetch-collection-metadata";
import "@/jobs/token-updates/floor-queue";
import "@/jobs/token-updates/token-reclac-supply";
