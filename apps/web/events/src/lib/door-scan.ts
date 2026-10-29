/**
 * Shape check for a value read from a ticket QR by the camera. The API is the
 * authority (it verifies the token tag); this only refuses obvious junk, such
 * as a URL on a poster, before it is sent. Formats follow `events/tickets.py`:
 * a signed token `BT1.<code>.<tag>` or a bare 10-character Crockford code.
 */
const TOKEN = /^BT1\.[0-9A-Za-z-]{10,12}\.[A-Za-z0-9_-]{8,64}$/;
const BARE_CODE = /^[0-9A-Za-z]{5}-?[0-9A-Za-z]{5}$/;
const MAX_LENGTH = 128;

export function parseScannedTicket(raw: string): string | null {
  const text = raw.trim();
  if (!text || text.length > MAX_LENGTH) {
    return null;
  }
  return TOKEN.test(text) || BARE_CODE.test(text) ? text : null;
}
