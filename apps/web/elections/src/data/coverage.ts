import type { PhotoId } from "@/data/photos";

/**
 * Election coverage posts. Editorial content: this local list stands in
 * until posts come from the Payload CMS, which owns writing (FastAPI owns
 * the data). Every post names its sources on its own page.
 */
export interface CoverageUpdate {
  /** ISO date-time of publication. */
  at: string;
  /** Files readers can download, such as our copy of a Gazette notice. */
  attachments?: { href: string; label: string; size: string }[];
  /** The article, one string per paragraph. */
  body: string[];
  /** A one- or two-sentence summary for the feed and the page deck. */
  dek: string;
  /** A note added after publication, shown at the top of the article. */
  editorNote?: string;
  /** Editors' pick for the lead story; otherwise the newest post leads. */
  featured?: boolean;
  /** A drawn graphic used instead of a photo: the election calendar. */
  graphic?: "election-timeline";
  /** Lead photo, shown under the headline and on the feed's lead story. */
  photo?: PhotoId;
  /** Constituency codes this update is about, if any. */
  seats?: string[];
  /** URL segment: the article lives at `/updates/<slug>`. */
  slug: string;
  /** A campaign source id, or a label and link for a source used only here. */
  sources: ({ id: string } | { label: string; url: string })[];
  /** A table reproduced from a source, such as the returning officers. */
  table?: { caption: string; columns: string[]; rows: string[][] };
  title: string;
}

export const COVERAGE: CoverageUpdate[] = [
  {
    at: "2026-10-02T19:00:00-04:00",
    slug: "parliament-dissolved",
    title: "Parliament is dissolved and the election must follow",
    dek: "The Governor-General dissolved Parliament on 2 October 2026. The Constitution requires a general election within three months.",
    editorNote:
      "Updated 3 October 2026: the writs issued on 2 October set nomination day for 15 October and polling day for 5 November.",
    body: [
      "Governor-General Dame Cécile La Grenade dissolved Parliament on 2 October 2026, acting on the Prime Minister’s advice. The proclamation ends the fourth session of the Eleventh Parliament, and the Clerk of Parliament announced it the same day.",
      "When this was first published, polling day had not been named: the Prime Minister was due to announce it at an event in St. Mark on 4 October. Section 53(1) of the Constitution requires a general election “within three months after any dissolution of Parliament”, so polling day must fall by 2 January 2027.",
      "After the election, the Governor-General appoints the new Senate (section 53(2)).",
    ],
    sources: [{ id: "dissolution" }, { id: "conch" }, { id: "constitution" }],
  },
  {
    at: "2026-10-03T14:30:00-04:00",
    slug: "writs-issued-polling-day-5-november",
    title: "Grenada votes on 5 November; nomination day is 15 October",
    dek: "The Supervisor of Elections has gazetted the writs. Nomination day is Thursday 15 October and polling day is Thursday 5 November 2026.",
    body: [
      "The Governor-General issued writs on 2 October 2026 to the returning officers of all 15 constituencies, according to a notice from the Supervisor of Elections, Arthur Pierre, in an extraordinary edition of the Government Gazette (No. 47) dated the same day. A writ instructs a returning officer to hold the election of a member for that constituency.",
      "Nomination day is 15 October 2026. Candidates hand in their nominations at their constituency’s returning office between 9:00 a.m. and 12 noon that day. Until then, the offices are open Monday to Friday from 9:00 a.m. to 5:00 p.m., and nomination forms can be collected during those hours.",
      "The notice, made under section 37 of the Representation of the People Act, says the poll will be taken, “if necessary”, on 5 November 2026. It describes polling day as not less than 15 and not more than 21 days after nomination day; 5 November is the 21st day.",
      "The notice also lists each constituency’s returning officer, office and telephone number. Some returning officers cover two offices, marked (A) and (B), in the larger constituencies. The table below reproduces the Gazette’s list.",
    ],
    table: {
      caption:
        "Returning officers, offices and telephone numbers (Government Gazette No. 47, 2 October 2026)",
      columns: ["Constituency", "Returning officer", "Office", "Telephone"],
      rows: [
        [
          "Carriacou & Petite Martinique",
          "Wendy Andrew",
          "Jah Live Building, Middle Street, Hillsborough",
          "443-6430",
        ],
        [
          "St. Andrew South East",
          "Shirleen Robertson",
          "Agriculture Office, Seaton James Street, Grenville",
          "438-5248",
        ],
        [
          "St. Andrew South West",
          "Junior Alexis",
          "La Qua’s Building, Gladstone Road, Grenville",
          "438-5228",
        ],
        [
          "St. Andrew North East",
          "Evan George Bhola",
          "Henroy Davis’ Building (junction of Paradise and Cocoa Road)",
          "442-4068",
        ],
        [
          "St. Andrew North West",
          "Glydon Christopher",
          "Annex to Mr. Mitchell’s shop, Mirabeau",
          "442-4367",
        ],
        [
          "St. David (A)",
          "Peter Regis",
          "Former NCB Building, Petite Esperance, St. David",
          "444-6025",
        ],
        [
          "St. David (B)",
          "Peter Regis",
          "Communal Cooperative Credit Union Building (downstairs), Perdmontemps, St. David",
          "444-6025",
        ],
        [
          "Town of St. George",
          "Stephen Raphael Croney",
          "Bruce Street, St. George’s (close to the exit of the Sendall Tunnel)",
          "440-4037",
        ],
        [
          "St. George North East (A)",
          "Margaret Belfon",
          "Ground floor of Deco’s Building Complex, Tempe, St. George",
          "435-5032",
        ],
        [
          "St. George North East (B)",
          "Margaret Belfon",
          "The Greens, St. Paul’s, St. George",
          "435-9474",
        ],
        [
          "St. George North West",
          "Kevin Francis",
          "Happy Hill, St. George (two-storey building on the Happy Hill main road, on the left after Shenda Road heading north)",
          "440-5145",
        ],
        [
          "St. George South East (A)",
          "Nicholas Glen Alexander",
          "Marian Community Centre, Cocoa Road, Marian, St. George",
          "440-6040",
        ],
        [
          "St. George South East (B)",
          "Nicholas Glen Alexander",
          "The Greens, St. Paul’s, St. George",
          "435-9477",
        ],
        [
          "St. George South (A)",
          "Cheryl Ann Dunbar",
          "Limes Road, Grand Anse, St. George (second building on the right entering Limes Road)",
          "439-7108",
        ],
        [
          "St. George South (B)",
          "Cheryl Ann Dunbar",
          "Café Junction, Springs, St. George (next to Liz and Rawle Restaurant)",
          "443-3726",
        ],
        [
          "St. John",
          "Seela Charles-Calliste",
          "Langton Road, Gouyave, St. John (downstairs, Mr. Carlton Frederick’s Building)",
          "437-1319",
        ],
        [
          "St. Mark",
          "Samuel Britton",
          "Queen Street, Victoria, St. Mark (downstairs, Ms. Louise George’s residence, opposite the Fish Market)",
          "437-1101",
        ],
        [
          "St. Patrick East",
          "Chrislyn La Borde",
          "GIDC Building, Sauteurs, St. Patrick",
          "442-0776",
        ],
        [
          "St. Patrick West",
          "Jennifer Charles",
          "GIDC Building, Sauteurs, St. Patrick",
          "442-0777",
        ],
      ],
    },
    attachments: [
      {
        label:
          "Government Gazette (Extraordinary) No. 47, 2 October 2026: Notice of Issuance of Writs",
        href: "/documents/official/gazette-2026-no-47-notice-of-writs.pdf",
        size: "PDF, 393 KB",
      },
    ],
    graphic: "election-timeline",
    photo: "parliament",
    sources: [{ id: "gazette47" }],
  },
  {
    at: "2026-10-03T18:30:00-04:00",
    slug: "keith-mitchell-retires",
    title: "Keith Mitchell retires from electoral politics after 42 years",
    dek: "The former Prime Minister told Parliament’s last sitting before the dissolution that he will not stand again. He won St. George North West at every general election from 1984 to 2022.",
    photo: "parliament",
    body: [
      "Dr Keith Mitchell, the former Prime Minister, announced his retirement from electoral politics at a special sitting of the House of Representatives on Thursday 1 October 2026, the day before Parliament was dissolved, the Caribbean Media Corporation reported.",
      "“I expect the next time around I’ll be in the (public) gallery,” he told the House. He said his departure was his own decision: “no one voted me out.”",
      "Our archive of official returns shows Keith Mitchell won St. George North West for the New National Party at all nine general elections from 1984 to 2022. In 2022 he took 2,211 votes to 773 for the NDC candidate, Gayton La Crette.",
      "The NNP named Adrian Joseph as its candidate for the constituency in February 2026, according to The New Today. GBN reported in September that Nigel Degale will stand for the NDC. Nominations are made on 15 October.",
    ],
    seats: ["J"],
    sources: [
      { id: "cmc2oct" },
      { id: "peoresults" },
      { id: "nnp14" },
      { id: "gbn-ndc2" },
    ],
  },
  {
    at: "2026-10-03T19:00:00-04:00",
    slug: "voter-registration-closed",
    featured: true,
    title: "Voter registration is closed until after the election",
    dek: "Issuing the writ closed registration on 2 October, and it stays suspended until after the election. The Parliamentary Elections Office asks voters to check their entry before polling day.",
    graphic: "election-timeline",
    body: [
      "The writ for the general election reached the Parliamentary Elections Office at 3:45 p.m. on 2 October 2026, the office said in a release published by NOW Grenada. “The issuance of the Writ officially closes voter registration,” the release said. “Registration will remain suspended until after the conclusion of the General Election.”",
      "That means the list of electors for 5 November is now fixed. The office asks every registered voter to check their entry before polling day, in either of two ways: online, through the electoral listing on peogrenada.org, or in person, on the printed lists displayed at courthouses, medical stations, revenue offices and other designated places in each constituency.",
      "Check that your name, address and polling division are right. The Parliamentary Elections Office, not Elections Grenada, confirms your registration and where you vote.",
    ],
    sources: [{ id: "peo3oct" }, { id: "gazette47" }],
  },
  {
    at: "2026-10-03T19:15:00-04:00",
    slug: "ndc-rally-st-mark-roads",
    title: "Roads closed in Victoria for the NDC’s rally on Sunday",
    dek: "The NDC holds its rally at Alston George Park, Victoria, on Sunday 4 October. Police traffic arrangements run from 4 p.m. to midnight.",
    body: [
      "The National Democratic Congress holds a rally at Alston George Park in Victoria, St. Mark, on Sunday 4 October 2026. The Prime Minister had said the party would present all 15 of its candidates on that date.",
      "The Royal Grenada Police Force says its traffic arrangements apply from 4 p.m. until midnight, with a parade expected to begin between 5:30 p.m. and 6 p.m. There is no entry to St David’s Street from the Queen Street intersection, Diamond Street from the Heroes Square intersection, the Bonair public road from the Queen Street bridge (except for residents), or Haddon Smith Street from the St David’s Street intersection.",
      "Public parking is on the right side of Diamond Street and St David’s Street, the left side of Haddon Smith Street, and the Bonair Government School fields. There is no parking on either side of Queen Street, or on the left sides of Diamond Street, St David’s Street, the Bonair road and Haddon Smith Street.",
    ],
    seats: ["N"],
    sources: [{ id: "rgpf1oct" }, { id: "ct30sep" }],
  },
  {
    at: "2026-10-04T20:00:00-04:00",
    slug: "mitchell-announces-5-november",
    title: "Prime Minister Mitchell announces polling day at the NDC rally",
    dek: "Prime Minister Dickon Mitchell announced at the NDC’s rally that Grenada votes on Thursday 5 November, the date the Gazette had already set.",
    body: [
      "Prime Minister Dickon Mitchell announced at the National Democratic Congress rally that polling day is Thursday 5 November 2026. The announcement had been expected since September, when the Prime Minister said the date would be given at an event in St. Mark on 4 October.",
      "The date matches the Supervisor of Elections’ notice in Government Gazette No. 47, issued on 2 October, which set nomination day for 15 October and polling day for 5 November.",
      "After the announcement the NDC’s official Facebook page posted a graphic reading “Election Day: Thursday 5th November” with the caption “The conch shell has sounded! The date is set.” We have not independently checked the post.",
    ],
    seats: ["N"],
    sources: [
      { id: "owner4oct" },
      { id: "ndc4oct" },
      { id: "gazette47" },
      { id: "conch" },
    ],
  },
];

/** A coverage post by its URL segment. */
export function coveragePost(slug: string): CoverageUpdate | undefined {
  return COVERAGE.find((post) => post.slug === slug);
}
