import type { Metadata } from "next";
import { ClockIn } from "@/components/hr/clock/clock-in";

export const metadata: Metadata = {
  title: "Clock in",
  description: "Record your arrival and departure at a clock point",
};

export default async function ClockPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const site = typeof params.site === "string" ? params.site : "";
  return (
    <div className="@container mx-auto max-w-md space-y-6">
      <div>
        <h1 className="font-semibold text-2xl tracking-tight">Clock in</h1>
        <p className="text-muted-foreground text-sm">
          Scan the clock point at your workplace to record your arrival or
          departure for today's rostered shift.
        </p>
      </div>
      <ClockIn initialCode={site} />
    </div>
  );
}
