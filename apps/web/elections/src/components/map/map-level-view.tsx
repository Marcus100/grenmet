"use client";

import { type ReactNode, useId, useState } from "react";

/** Map artwork stays server-rendered; only the level switch needs client state. */
export function MapLevelView({
  constituencyMap,
  divisionMap,
  unavailableReason = "Polling-division data is unavailable for this measure and date.",
  omitted = [],
  defaultLevel = "cons",
  className,
}: {
  constituencyMap: ReactNode;
  divisionMap?: ReactNode;
  unavailableReason?: string;
  omitted?: string[];
  defaultLevel?: "cons" | "div";
  className?: string;
}) {
  const [requested, setRequested] = useState(defaultLevel);
  const noteId = useId();
  const level = divisionMap && requested === "div" ? "div" : "cons";
  return (
    <div className={className}>
      <fieldset
        aria-describedby={divisionMap ? undefined : noteId}
        className="mb-3"
      >
        <legend className="mb-1 font-semibold text-base">Map detail</legend>
        <div className="flex flex-wrap gap-1">
          {(["cons", "div"] as const).map((option) => (
            <button
              aria-pressed={level === option}
              className={`min-h-11 touch-manipulation select-none rounded-md border px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${level === option ? "border-el-ink bg-el-ink text-el-paper" : "border-el-rule bg-el-paper text-el-ink hover:bg-el-paper-2"}`}
              disabled={option === "div" && !divisionMap}
              key={option}
              onClick={() => setRequested(option)}
              type="button"
            >
              {option === "cons" ? "Constituencies" : "Polling divisions"}
            </button>
          ))}
        </div>
      </fieldset>
      {!divisionMap && (
        <p className="mb-3 text-base text-el-muted" id={noteId}>
          {unavailableReason} Showing constituencies.
        </p>
      )}
      {level === "div" ? divisionMap : constituencyMap}
      {level === "div" && omitted.length > 0 && (
        <p className="mt-2 text-base text-el-muted" role="status">
          Boundary unavailable for {omitted.join(", ")}. These divisions are not
          drawn; their figures remain in the accompanying results or tables.
        </p>
      )}
    </div>
  );
}
