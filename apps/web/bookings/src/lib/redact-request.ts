// A ResponseError carries the Request, whose headers can hold secrets (the
// visitor secret, a bearer token); Node prints headers when an error is
// inspected or logged. Swap in a header-free copy before the error travels
// anywhere. Server only.

import { ResponseError } from "@barrelsgd/api-client";

export function redactRequest(error: unknown): never {
  if (ResponseError.is(error) && error.request instanceof Request) {
    error.request = new Request(error.request.url, {
      method: error.request.method,
    });
  }
  throw error;
}

/**
 * The same, for a call whose query string holds what a person typed (a name,
 * an email or a phone number in a search): the address is kept without its
 * query, so the search never reaches a log or an error report.
 */
export function redactRequestAndQuery(error: unknown): never {
  if (ResponseError.is(error) && error.request instanceof Request) {
    const url = new URL(error.request.url);
    url.search = "";
    error.request = new Request(url, { method: error.request.method });
  }
  throw error;
}
