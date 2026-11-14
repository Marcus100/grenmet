/**
 * Applies to every module behind AppShell (cap, hr, wxwatch, wxproducts,
 * salesbus). Deliberately no page transition: owner decision of 14 Nov 2026
 * (issue #1408). Staff change routes all day, and the old exit-then-enter
 * fade held every page back about 240 ms. Children render directly. The
 * component stays so AppShell does not change.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
