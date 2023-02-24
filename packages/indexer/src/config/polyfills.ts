/* eslint-disable @typescript-eslint/no-explicit-any */

// References:
// https://github.com/apollographql/apollo-link-rest/issues/41#issuecomment-354923559
// https://github.com/node-fetch/node-fetch#providing-global-access
import fetch, { Headers, Request, Response } from "node-fetch";
if (!global.fetch) {
  (global as any).fetch = fetch;
  (global as any).Headers = Headers;
  (global as any).Request = Request;
  (global as any).Response = Response;
}
