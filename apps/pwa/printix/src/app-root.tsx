import { GateApp } from "@/components/gate-app";
import { env } from "@/env";
import { OrganiserApp } from "@/organiser/organiser-app";
import { isOrganiserPath } from "@/organiser/routing";

/**
 * Picks the app by address. `/organiser` is the organiser screens; every other
 * address is the gate scanner, unchanged. Only one of the two mounts per page
 * load, which keeps their API client settings apart.
 */
export function ScannerRoot({ pathname }: { readonly pathname: string }) {
  return isOrganiserPath(pathname) ? (
    <OrganiserApp apiOrigin={env.VITE_API_URL} />
  ) : (
    <GateApp />
  );
}
