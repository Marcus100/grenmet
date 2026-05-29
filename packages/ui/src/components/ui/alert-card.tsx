import { cn } from "@grenmet/ui/lib/utils";
import { cva } from "class-variance-authority";
import type * as React from "react";

const STRIP_TITLES: Record<
  "green" | "yellow" | "amber" | "red" | "grey",
  string
> = {
  green: "GREEN WARNING",
  yellow: "YELLOW ADVISORY",
  amber: "AMBER WARNING",
  red: "RED WARNING",
  grey: "EXPIRED",
};

const stripVariants = cva(
  "flex h-[38px] shrink-0 items-center gap-2 overflow-hidden rounded-tl-gm-8 rounded-tr-gm-8 px-2.5 py-[7px] font-gm-document",
  {
    variants: {
      severity: {
        green: "bg-gm-warning-green-bg text-gm-warning-green-fg",
        yellow: "bg-gm-warning-yellow-bg text-gm-warning-yellow-fg",
        amber: "bg-gm-warning-amber-bg text-gm-warning-amber-fg",
        red: "bg-gm-warning-red-bg text-gm-warning-red-fg",
        grey: "bg-gm-warning-grey-bg text-gm-warning-grey-fg",
      },
    },
  }
);

const footerVariants = cva(
  "flex h-[18px] shrink-0 items-center gap-[6px] overflow-hidden px-3 py-[3px] font-gm-document text-[7.5px]",
  {
    variants: {
      size: {
        default: "bg-gm-surface",
        compact: "border-gm-border border-t bg-gm-surface-panel",
      },
    },
    defaultVariants: { size: "default" },
  }
);

export interface AlertCardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Hazard type shown as the strip subtitle, e.g. "Rain", "Marine Conditions". */
  hazard: string;
  impact: string;
  response: string;
  severity: "green" | "yellow" | "amber" | "red" | "grey";
  size?: "default" | "compact";
  /** Only grey cards use "expired"; all others default to "issued". */
  state?: "issued" | "expired";
  /** Overrides the auto-derived strip title (e.g. "GREEN WARNING"). */
  stripTitle?: string;
  /** Validity period string, e.g. "7:00 AM Mon to 7:00 AM Tue". */
  validity: string;
}

export function AlertCard({
  severity,
  state = "issued",
  size = "default",
  hazard,
  impact,
  response,
  validity,
  stripTitle,
  className,
  ...props
}: AlertCardProps) {
  const title = stripTitle ?? STRIP_TITLES[severity];

  return (
    <div
      className={cn(
        "flex w-[270px] flex-col overflow-hidden rounded-gm-8 border border-gm-border bg-gm-surface-page",
        size === "default" ? "h-[138px]" : "h-[137px]",
        className
      )}
      data-severity={severity}
      data-size={size}
      data-state={state}
      {...props}
    >
      {/* Severity strip */}
      <div className={stripVariants({ severity })}>
        <span className="shrink-0 font-bold text-gm-body-base leading-5">
          !
        </span>
        <div className="flex min-w-0 flex-1 flex-col text-gm-micro leading-[14px]">
          <span className="truncate font-bold">{title}</span>
          <span className="truncate font-medium">{hazard}</span>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex flex-1 flex-col gap-[5px] overflow-hidden px-3 pt-2 pb-1 font-gm-document leading-[11px]">
          <div className="flex flex-col gap-px overflow-hidden">
            <span className="font-bold text-[9px] text-gm-navy">Impact</span>
            <span className="line-clamp-2 font-normal text-[8.5px] text-gm-text-primary">
              {impact}
            </span>
          </div>
          <div className="flex flex-col gap-px overflow-hidden">
            <span className="font-bold text-[9px] text-gm-navy">Response</span>
            <span className="line-clamp-1 font-normal text-[8.5px] text-gm-text-primary">
              {response}
            </span>
          </div>
        </div>

        {/* Validity footer */}
        <div className={footerVariants({ size })}>
          <span className="w-[34px] shrink-0 font-bold text-gm-navy">
            Valid
          </span>
          <span className="truncate font-normal text-gm-text-secondary">
            {validity}
          </span>
        </div>
      </div>
    </div>
  );
}
