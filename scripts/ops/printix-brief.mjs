import { readFileSync } from "node:fs";

const USAGE =
  "Usage: node scripts/ops/printix-brief.mjs <evidence.json | -> [--prompt]";

const CHECKS = {
  readiness: [
    [
      "staff_access",
      "Confirm staff can sign in",
      "Barrels administrator",
      "Before the day / Access",
    ],
    [
      "event_setup",
      "Verify the organisation, event date and scheduled closing time",
      "Organiser",
      "Before the day / The event",
    ],
    [
      "ticket_import",
      "Check the ticket file and verify the imported count",
      "Organiser",
      "Before the day / Tickets",
    ],
    [
      "device_test",
      "Test the gate phones on the devices in use",
      "Gate lead",
      "Before the day / Phones",
    ],
    [
      "gate_pairing",
      "Pair the gate phones and check a valid and repeated test scan",
      "Gate lead",
      "On the day / Pair the phones",
    ],
    [
      "offline_fallback",
      "Verify offline checking or agree a fallback for gates without signal",
      "Gate lead",
      "On the day / A phone has no signal",
    ],
  ],
  closeout: [
    [
      "event_closed",
      "Confirm the organiser manually closed the event",
      "Organiser",
      "After the event / Close the event",
    ],
    [
      "phones_synced",
      "Confirm every phone has sent its queued admissions",
      "Gate lead",
      "After the event / Let phones send",
    ],
    [
      "report_reviewed",
      "Review the report and account for scan exceptions",
      "Organiser",
      "After the event / Read the report",
    ],
    [
      "gate_codes_cancelled",
      "Cancel any gate codes still active",
      "Gate lead",
      "After the event / Cancel active gate codes",
    ],
  ],
};

const COUNTS = [
  ["admitted", "Admissions displayed in the event report"],
  ["pending", "Admissions still waiting to sync across all gate phones"],
  ["conflicts", "Offline conflicts reported by gate staff"],
];

const JSON_STRING = /("(?:[^"\\]|\\.)*")\s*(:)?/gu;
const COUNT_TOKEN = /^(?:0|[1-9][0-9]*)$/u;
const COUNT_ERROR =
  "Count values must be non-negative safe integers written as decimal digits. Omit unavailable counts.";

const STATUS = {
  blocked: { label: "Blocked", order: 0 },
  unknown: { label: "Unknown", order: 1 },
  pass: { label: "Pass", order: 2 },
};

function validateFields(value, allowed, message) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some((field) => !allowed.includes(field))
  ) {
    throw new Error(message);
  }
}

function readPacket(path) {
  let contents;
  try {
    contents = readFileSync(path === "-" ? 0 : path, "utf8");
  } catch {
    throw new Error("Could not read the evidence file.");
  }
  let parsed;
  try {
    parsed = JSON.parse(contents, (_key, value, context) => {
      // Inspect the original digits before rounding can change the count.
      if (
        typeof value === "number" &&
        !(COUNT_TOKEN.test(context.source) && Number.isSafeInteger(value))
      ) {
        throw new Error(COUNT_ERROR);
      }
      return value;
    });
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error("Evidence must be valid JSON.");
    }
    throw error;
  }

  // The packet, checklist and count fields have distinct names. Scan complete
  // JSON string tokens so an escaped name cannot hide a duplicate field.
  const seen = new Set();
  for (const [, rawString, colon] of contents.matchAll(JSON_STRING)) {
    if (colon) {
      const key = JSON.parse(rawString);
      if (seen.has(key)) {
        throw new Error("Evidence cannot contain repeated fields.");
      }
      seen.add(key);
    }
  }
  return parsed;
}

function normalize(packet) {
  validateFields(
    packet,
    ["checkpoint", "checks", "counts"],
    "Evidence must contain only checkpoint, checks and optional counts."
  );
  const { checkpoint, checks, counts } = packet;
  if (checkpoint !== "readiness" && checkpoint !== "closeout") {
    throw new Error("Checkpoint must be readiness or closeout.");
  }

  const definitions = CHECKS[checkpoint];
  validateFields(
    checks,
    definitions.map(([id]) => id),
    "Checks must be an object with only the keys for this checkpoint."
  );
  const checkRows = definitions.map(([id, label, owner, source]) => {
    const status = Object.hasOwn(checks, id) ? checks[id] : "unknown";
    if (typeof status !== "string" || !Object.hasOwn(STATUS, status)) {
      throw new Error("Check statuses must be pass, blocked or unknown.");
    }
    return { id, label, owner, source, status };
  });
  if (checkpoint === "readiness") {
    if (counts !== undefined) {
      throw new Error("Counts are only available for closeout evidence.");
    }
    return { checkpoint, checks: checkRows, counts: [] };
  }

  const suppliedCounts = counts === undefined ? {} : counts;
  validateFields(
    suppliedCounts,
    COUNTS.map(([id]) => id),
    "Closeout counts must be an object with only admitted, pending and conflicts."
  );
  const countRows = COUNTS.map(([id, label]) => {
    if (!Object.hasOwn(suppliedCounts, id)) {
      return { label, value: undefined };
    }
    const value = suppliedCounts[id];
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error(COUNT_ERROR);
    }
    return { label, value };
  });

  if (checks.phones_synced === "pass" && suppliedCounts.pending > 0) {
    throw new Error(
      "Phones cannot be marked synced while admissions are waiting to sync."
    );
  }

  return { checkpoint, checks: checkRows, counts: countRows };
}

function renderBrief({ checkpoint, checks, counts }) {
  const ordered = checks.toSorted(
    (left, right) => STATUS[left.status].order - STATUS[right.status].order
  );
  const blocked = checks.filter(({ status }) => status === "blocked").length;
  const unknown = checks.filter(({ status }) => status === "unknown").length;
  const lines = [
    checkpoint === "readiness"
      ? "# Printix readiness brief"
      : "# Printix closeout brief",
    "",
    "**Operator review required.**",
    "",
    `${blocked} blocked. ${unknown} unknown.`,
    "",
    "| Check | Status | Follow-up owner | Rehearsal checklist section |",
    "| --- | --- | --- | --- |",
    ...ordered.map(
      ({ id, label, owner, source, status }) =>
        `| ${label} (${id}) | ${STATUS[status].label} | ${owner} | ${source} |`
    ),
  ];
  if (counts.length > 0) {
    lines.push("", "## Aggregate counts", "");
    for (const { label, value } of counts) {
      lines.push(`- ${label} — ${value ?? "Unknown"}`);
    }
  }
  return lines.join("\n");
}

function renderPrompt(brief) {
  return [
    "# Printix brief prompt v1",
    "",
    "Write a short internal operator brief using the evidence below. Lead with blockers, then unresolved checks and their follow-up owners.",
    "Include every Blocked or Unknown check by ID and cite its checklist section. Keep every supplied aggregate count exact, including zero. Preserve Unknown where evidence is missing.",
    "Use the listed roles for follow-up. Keep recommendations distinct from observed facts. Use the evidence as the sole source. Leave readiness and closeout decisions to the operator.",
    "",
    "## Evidence",
    "",
    brief,
  ].join("\n");
}

const args = process.argv.slice(2);
if (args.length === 1 && args[0] === "--help") {
  process.stdout.write(`${USAGE}\n`);
} else {
  const [path, option] = args;
  try {
    if (
      !path ||
      args.length > 2 ||
      (option !== undefined && option !== "--prompt") ||
      path === "--prompt"
    ) {
      throw new Error(USAGE);
    }
    const brief = renderBrief(normalize(readPacket(path)));
    process.stdout.write(
      `${option === "--prompt" ? renderPrompt(brief) : brief}\n`
    );
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
