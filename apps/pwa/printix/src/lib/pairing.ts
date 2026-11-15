/**
 * The pairing link an administrator shows as a QR code:
 * `https://<scanner origin>/#pair=<secret>`. The secret sits in the URL
 * fragment, which browsers never send to a server, write to an access log or
 * pass on in a Referer header (ADR-0060).
 */
const PAIR_PARAM = "pair";
/** `token_urlsafe(32)` gives 43 characters; the API accepts up to 128. */
const SECRET_SHAPE = /^[A-Za-z0-9_-]{43,128}$/u;

export type PairingFragment =
  | { readonly kind: "absent" }
  | { readonly kind: "invalid" }
  | { readonly kind: "paired"; readonly secret: string };

export function isPairingSecretShape(value: string): boolean {
  return SECRET_SHAPE.test(value);
}

/**
 * What the address fragment says. The value is never echoed back, so the
 * result is safe to log or show if it is ever needed for a message.
 */
export function readPairingFragment(hash: string): PairingFragment {
  const params = new URLSearchParams(
    hash.startsWith("#") ? hash.slice(1) : hash
  );
  const value = params.get(PAIR_PARAM);
  if (value === null) {
    return { kind: "absent" };
  }
  return isPairingSecretShape(value)
    ? { kind: "paired", secret: value }
    : { kind: "invalid" };
}
