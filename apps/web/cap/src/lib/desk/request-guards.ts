import { getRequestOrigin } from "@barrelsgd/auth/server";

/** Largest body the desk proxy forwards. A CAP alert is a few kilobytes. */
export const MAX_BODY_BYTES = 1_000_000;

/**
 * Cookies are SameSite=Lax and host-only, but other *.barrels.gd hosts are the
 * same site, so a change must come from this host's own pages. A missing Origin
 * is refused too: browsers send it on every cross-origin and form POST.
 */
export function isSameOrigin(headers: Headers): boolean {
  const origin = headers.get("origin");
  return origin !== null && origin === getRequestOrigin(headers);
}

export class BodyTooLargeError extends Error {
  constructor() {
    super("Request body too large");
    this.name = "BodyTooLargeError";
  }
}

/**
 * Reads a request body up to `limit` bytes. Refuses early on Content-Length and
 * again while reading, because a client may lie about or omit the length.
 */
export async function readLimitedBody(
  request: Request,
  limit: number = MAX_BODY_BYTES
): Promise<Uint8Array> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > limit) {
    throw new BodyTooLargeError();
  }
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      throw new BodyTooLargeError();
    }
    chunks.push(value);
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}
