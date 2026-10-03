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
  /** A campaign source id, or a label and link for a source used only here. */
  sources: ({ id: string } | { label: string; url: string })[];
  title: string;
}

export const COVERAGE: CoverageUpdate[] = [
  {
    at: "2026-10-02T19:00:00-04:00",
    title: "Parliament is dissolved and the election must follow",
    body: "Governor-General Dame Cécile La Grenade dissolved Parliament on 2 October 2026, acting on the Prime Minister’s advice. The proclamation ends the fourth session of the Eleventh Parliament, and the Clerk of Parliament announced it the same day. Polling day has not yet been named: the Prime Minister is due to announce it at an event in St. Mark on 4 October. Section 53(1) of the Constitution requires a general election “within three months after any dissolution of Parliament”, so polling day must fall by 2 January 2027. After the election, the Governor-General appoints the new Senate (section 53(2)).",
    sources: [{ id: "dissolution" }, { id: "conch" }, { id: "constitution" }],
  },
];
