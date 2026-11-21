/** Full-page navigation to the payment provider. Kept apart so tests can stub it. */
export function goToCheckout(url: string): void {
  window.location.assign(url);
}

/**
 * Full-page navigation to sign-in. A client-side router push fetches the
 * sign-in route, which redirects to the Barrels account host; that fetch
 * fails the connect-src check, so the page must load in full.
 */
export function goToSignIn(returnTo: string): void {
  window.location.assign(`/sign-in?returnTo=${encodeURIComponent(returnTo)}`);
}
