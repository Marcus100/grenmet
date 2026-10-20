/** Full-page navigation to the payment provider. Kept apart so tests can stub it. */
export function goToCheckout(url: string): void {
  window.location.assign(url);
}
