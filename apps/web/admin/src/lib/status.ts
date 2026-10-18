/**
 * Overview status cards. Mapping is pure so each state is testable without a
 * network; `probeApi` is the only function here that does I/O.
 */

export type StatusTone = "ok" | "down" | "unknown";

export interface StatusCardData {
  detail: string;
  id: string;
  summary: string;
  title: string;
  tone: StatusTone;
}

export type ProbeResult =
  | { kind: "response"; status: number; body: unknown }
  | { kind: "unreachable" };

const PROBE_TIMEOUT_MS = 5000;

export async function probeApi(url: string): Promise<ProbeResult> {
  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      // A probe body is optional; the status code is what matters.
    }
    return { kind: "response", status: response.status, body };
  } catch {
    return { kind: "unreachable" };
  }
}

/** `GET /utils/health-check/` returns 200 and JSON `true` while the process runs. */
export function mapLiveness(result: ProbeResult): StatusCardData {
  const base = { id: "api-liveness", title: "API process" };
  if (result.kind === "unreachable") {
    return {
      ...base,
      tone: "down",
      summary: "Unreachable",
      detail: "The API did not answer the liveness probe.",
    };
  }
  if (result.status === 200 && result.body === true) {
    return {
      ...base,
      tone: "ok",
      summary: "Running",
      detail: "Liveness probe answered.",
    };
  }
  return {
    ...base,
    tone: "down",
    summary: `Unexpected reply (${result.status})`,
    detail: "The liveness probe did not return the expected answer.",
  };
}

/** `GET /utils/ready/` is 200 when the database is reachable and migrated. */
export function mapReadiness(result: ProbeResult): StatusCardData {
  const base = { id: "api-readiness", title: "API and database" };
  if (result.kind === "unreachable") {
    return {
      ...base,
      tone: "unknown",
      summary: "Unknown",
      detail: "The API did not answer, so readiness could not be checked.",
    };
  }
  if (result.status === 200) {
    return {
      ...base,
      tone: "ok",
      summary: "Ready",
      detail: "Database reachable and schema up to date.",
    };
  }
  if (result.status === 503) {
    return {
      ...base,
      tone: "down",
      summary: "Not ready",
      detail: "The database is unreachable or its schema is out of date.",
    };
  }
  return {
    ...base,
    tone: "down",
    summary: `Unexpected reply (${result.status})`,
    detail: "The readiness probe did not return the expected answer.",
  };
}

/** The API does not expose a worker heartbeat yet; say so rather than guess. */
export function workerCard(): StatusCardData {
  return {
    id: "worker",
    title: "Background worker",
    tone: "unknown",
    summary: "Not exposed",
    detail:
      "The API has no worker heartbeat endpoint yet, so this stays unknown.",
  };
}

/** This build's own release label; the API has no deploy-history endpoint yet. */
export function releaseCard(release: string): StatusCardData {
  const label = release.trim();
  return {
    id: "release",
    title: "This console's release",
    tone: label ? "ok" : "unknown",
    summary: label || "Not set",
    detail: label
      ? "Release label baked into this build."
      : "No release label was set for this build. Deploy history is not exposed by the API yet.",
  };
}

export function organisationsCard(count: number | null): StatusCardData {
  const base = { id: "organisations", title: "Organisations" };
  if (count === null) {
    return {
      ...base,
      tone: "unknown",
      summary: "Unknown",
      detail: "The organisation list could not be read.",
    };
  }
  return {
    ...base,
    tone: "ok",
    summary: String(count),
    detail:
      count === 1
        ? "Organisation on the platform."
        : "Organisations on the platform.",
  };
}
