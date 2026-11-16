/** The organiser screens live under this address on the scanner's own origin. */
export const ORGANISER_PATH = "/organiser";

/**
 * Whether an address belongs to the organiser screens: `/organiser` and what
 * sits under it. Other addresses (the gate's `/`) keep the gate scanner.
 */
export function isOrganiserPath(pathname: string): boolean {
  return (
    pathname === ORGANISER_PATH || pathname.startsWith(`${ORGANISER_PATH}/`)
  );
}
