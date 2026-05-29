"use client";
import { BoxIconLine, GroupIcon } from "@/icons";

export const EcommerceMetrics = () => {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-6">
      {/* <!-- Metric Item Start --> */}
      <div className="rounded-2xl border border-border bg-background p-5 md:p-6">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gray-100">
          <GroupIcon className="size-6 text-foreground" />
        </div>

        <div className="mt-5 flex items-end justify-between">
          <p>METAR GOES HERE</p>
        </div>
      </div>
      {/* <!-- Metric Item End --> */}

      {/* <!-- Metric Item Start --> */}
      <div className="rounded-2xl border border-border bg-background p-5 md:p-6">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gray-100">
          <BoxIconLine className="text-foreground" />
        </div>
        <p>TAF GOES HERE</p>
      </div>
      {/* <!-- Metric Item End --> */}
    </div>
  );
};
