import { ClockIcon } from "lucide-react";
import { FORECAST_ISSUED } from "@/lib/forecast-data";

export function IssuedStamp() {
  return (
    <div className="flex items-center gap-2 text-body-sm text-gm-text-secondary leading-body-sm">
      <ClockIcon aria-hidden="true" className="size-3.5 shrink-0" />
      Issued {FORECAST_ISSUED.issuedAt} &middot; next update{" "}
      {FORECAST_ISSUED.nextUpdate}
    </div>
  );
}
