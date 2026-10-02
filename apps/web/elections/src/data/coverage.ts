/**
 * Election coverage posts. Editorial content: this local list stands in
 * until posts come from the Payload CMS, which owns writing (FastAPI owns
 * the data). Every post names its sources.
 */
export interface CoverageUpdate {
  /** ISO date-time of publication. */
  at: string;
  body: string;
  /** Constituency codes this update is about, if any. */
  seats?: string[];
  sources: { label: string; url: string }[];
  title: string;
}

export const COVERAGE: CoverageUpdate[] = [];
