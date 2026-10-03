export const PAGE_LEARNING = {
  election: {
    question: "What does this stage mean?",
    answer:
      "Read dates and candidate announcements according to their source. A party selection is not an official nomination, and a reported date is not a proclaimed date.",
    guide: "how-elections-work",
    action: "Understand the election process",
    caution:
      "Current coverage includes secondary reports and supplied confirmations. Open the source beside each claim.",
  },
  results: {
    question: "What am I comparing?",
    answer:
      "Votes measure recorded support; seats count constituency winners. Choose an election, then inspect the complete return before drawing a conclusion from a map colour.",
    guide: "counting-and-results",
    action: "Learn to read results",
    caution:
      "Maps are illustrative, not official boundary files. Missing returns remain unknown; a partial station total is not a complete constituency result.",
  },
  constituency: {
    question: "How does this place connect to the result?",
    answer:
      "A constituency elects a representative. Polling divisions and stations are smaller parts of its voting record, not additional seats. Compare the same geography and election dates.",
    guide: "constituencies-and-representation",
    action: "Understand local representation",
    caution:
      "Historical winners and later party affiliations are different facts. Confirm voting arrangements with the PEO; our reconstructed map is not an eligibility lookup.",
  },
  people: {
    question: "What does a candidate record establish?",
    answer:
      "A recorded candidacy, an announced party selection and an official nomination are different stages. Follow the source and election date attached to each entry.",
    guide: "how-elections-work",
    action: "From nomination to representation",
    caution:
      "Historical names are matched heuristically where spelling varies. A combined career record is not independent proof of identity; supplied confirmations remain labelled.",
  },
  parties: {
    question: "How should I compare parties?",
    answer:
      "Compare vote share, constituencies contested and seats won separately. A party can gain votes without gaining seats; affiliation changes after an election do not rewrite its result.",
    guide: "counting-and-results",
    action: "Understand votes, shares and seats",
    caution:
      "IND groups independent candidates for display; it is not one political party. Historical aliases and source gaps need care.",
  },
  forecast: {
    question: "What would have to be true for this outcome?",
    answer:
      "Start with the assumptions, change one input at a time, then inspect the range. A modelled chance is neither a vote share nor an official prediction.",
    guide: "polls-and-predictions",
    action: "Understand polls and uncertainty",
    caution:
      "Some support inputs lack original poll reports. Ratings are conditional model outputs. The replay uses a simulated counting order, not the recorded election-night chronology.",
  },
  scenario: {
    question: "What happens if I change the assumptions?",
    answer:
      "Build a possible outcome, inspect the seat total and compare it with another scenario. Your choices demonstrate consequences; they are not observations of public opinion.",
    guide: "polls-and-predictions",
    action: "Learn with scenarios",
    caution:
      "Illustrative scenario · not an official result, poll or endorsement. Sharing a map preserves a scenario, not a forecast guarantee.",
  },
  statistics: {
    question: "What is the denominator?",
    answer:
      "A margin subtracts two shares; turnout divides participation by registration. Check the formula, period and geography before comparing numbers.",
    guide: "counting-and-results",
    action: "Understand election statistics",
    caution:
      "Relationships between areas do not establish how individuals voted or why. Calculations inherit their source limitations.",
  },
  referendum: {
    question: "What question did voters answer?",
    answer:
      "Read each proposition and its approval rule separately. Seven referendum questions can generate seven responses per participant; combined responses are not unique people.",
    guide: "referendums",
    action: "Understand referendum results",
    caution:
      "2016 per-bill results rely on secondary reports. Damaged 2018 Gazette pages leave gaps in local results; they are not zeros.",
  },
  register: {
    question: "Who is counted on this list?",
    answer:
      "These are administrative snapshots, not a census or a measure of votes cast. Compare the same coverage before explaining an increase or decrease.",
    guide: "registering-and-voting",
    action: "Understand registration",
    caution:
      "These counts omit separately listed police electors. Addenda and net changes do not establish removals or transfers; occupation labels are not current labour-market statistics.",
  },
  evidence: {
    question: "Does the source support the exact claim?",
    answer:
      "Inspect the publisher, document, location and formula. Official publication, original reporting and arithmetic consistency answer different questions about evidence.",
    guide: "checking-election-claims",
    action: "Learn to check a claim",
    caution:
      "Full history includes secondary and supplied records. Official documents can also conflict; open issues are preserved below.",
  },
} as const;
export type PageLearningTopic = keyof typeof PAGE_LEARNING;
