/* eslint-disable @typescript-eslint/no-explicit-any */

import { ErrorCause } from "@elastic/elasticsearch/lib/api/types";

export const isRetryableError = (error: any): boolean => {
  let retryableError =
    (error as any).meta?.meta?.aborted ||
    (error as any).meta?.body?.error?.caused_by?.type === "node_not_connected_exception";

  const rootCause = (error as any).meta?.body?.error?.root_cause as ErrorCause[];

  if (!retryableError && rootCause?.length) {
    retryableError = ["node_disconnected_exception", "node_not_connected_exception"].includes(
      rootCause[0].type
    );
  }

  return retryableError;
};
