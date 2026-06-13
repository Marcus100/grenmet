/**
 * Resolve a GrenMet design-system CSS custom property (e.g. `--gm-blue`) to its
 * computed value at runtime.
 *
 * Charting libraries such as ApexCharts parse the color string themselves to
 * compute gradients and opacity, so they cannot consume a raw `var(--gm-*)`
 * string the way CSS can. This reads the resolved token value from `:root`
 * instead, keeping chart colors driven by the same tokens as the rest of the UI.
 *
 * Returns `""` during SSR; only use it for charts that render client-only
 * (`dynamic(..., { ssr: false })`). For components that render real DOM, prefer
 * a CSS `var(--gm-*)` value via `style` so it resolves without JS.
 */
export function gmColor(token: `--gm-${string}`): string {
  if (typeof window === "undefined") {
    return "";
  }

  return getComputedStyle(document.documentElement)
    .getPropertyValue(token)
    .trim();
}
