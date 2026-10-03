import type { Verification } from "@/data/types";

const MARKS: Partial<Record<Verification, { mark: string; title: string }>> = {
  unverified: {
    mark: "✱",
    title: "Not yet verified against an official record. See Sources.",
  },
  check: {
    mark: "✱✱",
    title: "The official copy is unclear or conflicts with other sources.",
  },
  corroborated: {
    mark: "†",
    title:
      "From a contemporaneous report that matches the official record wherever it can be checked.",
  },
};

/** The ✱ / ✱✱ / † mark beside a figure; nothing for official figures. */
export function Flag({
  status,
  note,
}: {
  status: Verification | null | undefined;
  /** A specific reason, shown instead of the generic one. */
  note?: string;
}) {
  const entry = status ? MARKS[status] : undefined;
  if (!entry) return null;
  return (
    <sup
      className="ml-0.5 cursor-help text-el-muted"
      title={note ?? entry.title}
    >
      {entry.mark}
      <span className="sr-only"> ({note ?? entry.title})</span>
    </sup>
  );
}
