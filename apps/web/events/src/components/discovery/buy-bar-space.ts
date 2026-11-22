/**
 * Room at the very end of the page for the fixed phone buy bar (TicketClaim),
 * so the footer, including its last lines, can scroll clear of the bar.
 *
 * It sits on the wrapper around the main column and the footer, and applies
 * only while a buy bar is on the page (`data-buy-bar`). A 2026 bar is about
 * 100 px tall; `pb-36` (144 px) clears it. In the installed app the bottom
 * tab bar (3.5rem plus the safe-area inset) sits below the buy bar too, so the
 * installed-app value adds that height on top.
 */
export const BUY_BAR_SPACE_CLASS =
  "max-lg:has-[[data-buy-bar]]:pb-36 max-lg:standalone:has-[[data-buy-bar]]:pb-[calc(9rem_+_3.5rem_+_env(safe-area-inset-bottom))]";
