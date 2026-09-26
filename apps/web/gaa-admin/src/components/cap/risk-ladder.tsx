"use client";

import { motion } from "motion/react";
import { useId } from "react";
import { SEVERITY_RISK_VAR } from "@/lib/cap-severity";

interface RiskLadderProps<T extends string> {
  /** Only severity carries semantic risk colour — urgency/certainty stay neutral so colour keeps meaning "how bad", not "how soon". */
  colored?: boolean;
  label: string;
  onChange: (value: T) => void;
  options: readonly T[];
  value: T;
}

function stepTextColor(selected: boolean, option: string): string {
  if (!selected) {
    return "var(--gm-text-secondary)";
  }
  // Yellow (Moderate) and orange (Severe) fills need dark text for contrast.
  return option === "Moderate" || option === "Severe"
    ? "var(--gm-text-primary)"
    : "var(--gm-text-inverse)";
}

/**
 * A segmented "ladder" for CAP's ordinal severity/urgency/certainty fields.
 * Replaces three identical <select> menus — see the CAP editor redesign
 * proposal. The selected step slides via a shared layoutId instead of each
 * step animating its own background, so the highlight reads as one object
 * moving, not five buttons independently fading.
 *
 * Built on native <input type="radio"> (visually hidden) rather than a
 * role="radio" div, so keyboard/AT semantics come from the browser instead
 * of being hand-rolled.
 */
export function RiskLadder<T extends string>({
  label,
  value,
  options,
  onChange,
  colored,
}: RiskLadderProps<T>) {
  const groupId = useId();
  return (
    <fieldset className="grid gap-1.5 border-none p-0">
      <div className="flex items-center justify-between">
        <legend className="text-gm-text-muted text-micro leading-micro">
          {label}
        </legend>
        <span className="font-mono text-gm-text-secondary text-micro leading-micro">
          {value}
        </span>
      </div>
      <div className="flex gap-1.5">
        {options.map((option) => {
          const selected = option === value;
          return (
            <label
              className="relative flex-1 cursor-pointer rounded-md border border-gm-border px-1 py-2 text-center font-semibold text-caption leading-caption"
              key={option}
            >
              <input
                checked={selected}
                className="sr-only"
                name={groupId}
                onChange={() => onChange(option)}
                type="radio"
                value={option}
              />
              {selected ? (
                <motion.span
                  className="absolute inset-0 rounded-md"
                  layoutId={`${groupId}-fill`}
                  style={{
                    background: colored
                      ? SEVERITY_RISK_VAR[
                          option as unknown as keyof typeof SEVERITY_RISK_VAR
                        ]
                      : "var(--gm-navy)",
                  }}
                  transition={{ type: "spring", stiffness: 500, damping: 34 }}
                />
              ) : null}
              <span
                className="relative z-10"
                style={{ color: stepTextColor(selected, option) }}
              >
                {option}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
