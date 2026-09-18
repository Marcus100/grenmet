"use client";

import type { CapSeverity, CapUrgency } from "@barrelsgd/api-client";
import { motion } from "motion/react";
import { SEVERITY_BADGE_VARIANT, SEVERITY_HEX } from "@/lib/cap-severity";

export interface LivePreviewProps {
  areaDesc: string;
  contact: string;
  description: string;
  effective: string;
  expires: string;
  headline: string;
  instruction: string;
  senderName: string;
  severity: CapSeverity;
  urgency: CapUrgency;
}

const BAND_TEXT: Record<string, string> = {
  "solid-warning": "var(--gm-text-primary)",
};

/**
 * The public-facing bulletin, live, next to the form that produces it. The
 * existing review step (AlertWorkflow) only shows this after submission —
 * seeing it while still editing catches a wrong severity colour or a missing
 * area before it reaches submit.
 */
export function LivePreview({
  headline,
  severity,
  urgency,
  areaDesc,
  effective,
  expires,
  description,
  instruction,
  senderName,
  contact,
}: LivePreviewProps) {
  const bandVariant = SEVERITY_BADGE_VARIANT[severity];
  const bandColor = SEVERITY_HEX[severity];
  const bandText = BAND_TEXT[bandVariant] ?? "#fff";

  return (
    <div className="overflow-hidden rounded-xl border border-gm-border bg-card shadow-card">
      <div className="flex items-center justify-between border-gm-border border-b bg-gm-surface px-4 py-2.5">
        <span className="text-gm-text-muted text-label leading-label">
          Public preview
        </span>
        <span className="font-mono text-gm-text-muted text-micro leading-micro">
          weather.gaa.gd
        </span>
      </div>
      <motion.div
        animate={{ backgroundColor: bandColor }}
        className="px-5 py-4"
        style={{ color: bandText }}
        transition={{ duration: 0.2 }}
      >
        <span className="text-label leading-label opacity-90">
          {severity.toUpperCase()} · {urgency.toUpperCase()}
        </span>
        <h3 className="mt-1 text-body-base leading-body-base">
          {headline || "Untitled alert"}
        </h3>
      </motion.div>
      <div className="space-y-3 px-5 py-4">
        <PreviewRow label="Areas" value={areaDesc || "No area selected"} />
        <PreviewRow label="Effective" mono value={effective} />
        <PreviewRow label="Expires" mono value={expires} />
        {description ? (
          <p className="text-body-sm text-gm-text-secondary leading-body-sm">
            {description}
          </p>
        ) : null}
        {instruction ? (
          <div className="rounded-md bg-gm-surface-panel px-3 py-2.5">
            <p className="text-gm-sky-ink text-label leading-label">
              What to do
            </p>
            <p className="mt-0.5 text-body-sm leading-body-sm">{instruction}</p>
          </div>
        ) : null}
      </div>
      <div className="border-gm-border border-t px-5 py-3 text-gm-text-muted text-micro leading-micro">
        Issued by <span className="font-semibold">{senderName}</span> ·{" "}
        {contact}
      </div>
    </div>
  );
}

function PreviewRow({
  label,
  value,
  mono,
}: {
  label: string;
  mono?: boolean;
  value: string;
}) {
  return (
    <div className="flex gap-2 text-body-sm leading-body-sm">
      <span className="w-16 flex-shrink-0 font-semibold text-gm-text-primary">
        {label}
      </span>
      <span
        className={
          mono ? "font-mono text-gm-text-secondary" : "text-gm-text-secondary"
        }
      >
        {value || "Not set"}
      </span>
    </div>
  );
}

export interface ReadinessChecklistProps {
  hasArea: boolean;
  hasMessage: boolean;
  isActualStatus: boolean;
  riskAssessed: boolean;
}

export function ReadinessChecklist({
  hasMessage,
  riskAssessed,
  hasArea,
  isActualStatus,
}: ReadinessChecklistProps) {
  const items = [
    { ok: hasMessage, text: "Headline, event and description present" },
    { ok: riskAssessed, text: "Severity, urgency, certainty assessed" },
    { ok: hasArea, text: "At least one area selected" },
    { ok: isActualStatus, text: "Status is Actual (not a drill)" },
  ];
  return (
    <div className="rounded-xl border border-gm-border bg-card p-4 shadow-card">
      <span className="text-gm-text-muted text-label leading-label">
        Ready to submit
      </span>
      <ul className="mt-2.5 space-y-1.5">
        {items.map((item) => (
          <li
            className="flex items-center gap-2 text-body-sm leading-body-sm"
            key={item.text}
            style={{
              color: item.ok
                ? "var(--gm-text-primary)"
                : "var(--gm-text-secondary)",
            }}
          >
            <motion.span
              animate={{
                backgroundColor: item.ok ? "#b9ee63" : "rgba(0,0,0,0)",
              }}
              className={`flex size-4 flex-shrink-0 items-center justify-center rounded-full border ${
                item.ok ? "border-[#3f7a0f]" : "border-gm-border"
              }`}
              transition={{ duration: 0.15 }}
            >
              {item.ok ? (
                <motion.svg
                  animate={{ pathLength: 1, opacity: 1 }}
                  fill="none"
                  height="8"
                  initial={{ pathLength: 0, opacity: 0 }}
                  stroke="var(--gm-lime-ink)"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2.5"
                  viewBox="0 0 10 8"
                  width="10"
                >
                  <motion.path d="M1 4L3.5 6.5L9 1" />
                </motion.svg>
              ) : null}
            </motion.span>
            {item.text}
          </li>
        ))}
      </ul>
    </div>
  );
}
