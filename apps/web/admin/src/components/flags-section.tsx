import { FlagsError, FlagsPanel } from "@/components/flag-panels";
import { listFlags, listStaleFlags } from "@/lib/flags-api";
import { reportError } from "@/lib/report-error";

/** Streams in behind Suspense so a slow or failing call never blocks the page. */
export async function FlagsSection({ accessToken }: { accessToken: string }) {
  try {
    const [flags, stale] = await Promise.all([
      listFlags(accessToken),
      listStaleFlags(accessToken),
    ]);
    return (
      <FlagsPanel
        flags={flags.data}
        staleIds={stale.data.map((flag) => flag.id)}
      />
    );
  } catch (error) {
    reportError(error, "admin-flags");
    return <FlagsError />;
  }
}
