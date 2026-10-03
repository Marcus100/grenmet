import type { EvidenceId } from "@/data/evidence";

export interface LearningGuide {
  answer: string;
  example: { title: string; text: string };
  exercise: { question: string; answer: string };
  keywords: string[];
  misconception: string;
  next: { href: string; label: string }[];
  question: string;
  sections: { title: string; paragraphs: string[]; sources: EvidenceId[] }[];
  slug: string;
  title: string;
}
export const GUIDES: LearningGuide[] = [
  {
    slug: "how-elections-work",
    title: "How Grenada’s elections work",
    question: "What are we choosing when we vote?",
    answer:
      "Start with the constituency result, then the House. A general election chooses representatives; the national party vote and the number of seats answer different questions.",
    keywords: [
      "general election",
      "first past the post",
      "majority",
      "prime minister",
      "dissolution",
      "writ",
      "nomination",
    ],
    sections: [
      {
        title: "Follow the sequence",
        paragraphs: [
          "Separate the stages: dissolution ends a Parliament; the election process includes nominations, voting and the declaration of results. An announcement, a nomination and a declared result are different kinds of evidence. Our current-election page identifies which stage has been documented.",
          "The Constitution requires a general election within three months of dissolution. Use the official notice for the actual dates; a constitutional deadline is not itself polling day.",
        ],
        sources: ["constitution", "report2022"],
      },
      {
        title: "Read the result at two levels",
        paragraphs: [
          "At constituency level, compare the candidates’ votes and identify the winner. Nationally, add votes to measure support and count constituency winners to measure seats. A large vote total in one place cannot be exchanged for an additional seat elsewhere.",
          "The 2022 archive has 15 constituency contests. Nine NDC wins and six NNP wins describe the distribution of seats, not the proportion of voters who supported each party.",
        ],
        sources: ["report2022"],
      },
      {
        title: "Separate winning seats from forming a government",
        paragraphs: [
          "The Governor-General appoints as Prime Minister a House member likely to command majority support. Do not treat a national vote-share lead as a direct election to that office.",
        ],
        sources: ["constitution"],
      },
    ],
    example: {
      title: "Illustration: support and representation",
      text: "Imagine three constituencies of 100 voters each. Party A wins 51, 51 and 0 votes; Party B wins 49, 49 and 100. A wins two seats with 102 votes, while B wins one with 198. This arithmetic example explains why votes and seats need not move together; it is not a Grenada result.",
    },
    misconception:
      "The party with the most votes nationally automatically receives the most seats. Constituency outcomes, not proportional allocation, determine seat totals.",
    exercise: {
      question: "Does winning 60% of votes guarantee 60% of seats?",
      answer:
        "No. You must examine where those votes were cast and which candidates won the constituencies.",
    },
    next: [
      { href: "/2026", label: "Follow the current election" },
      {
        href: "/learn/parliament-and-government",
        label: "Understand government formation",
      },
      { href: "/results", label: "Explore actual results" },
    ],
  },
  {
    slug: "registering-and-voting",
    title: "Registering and voting",
    question: "How do I prepare to take part?",
    answer:
      "Check your registration and the current instructions from the Parliamentary Elections Office. This site explains the process; the PEO confirms your eligibility, registration and polling arrangements.",
    keywords: [
      "register",
      "vote",
      "voter ID",
      "polling station",
      "eligibility",
      "first time",
      "deadline",
    ],
    sections: [
      {
        title: "Check the record, not an assumption",
        paragraphs: [
          "The PEO provides voter-status information. Confirm your entry and the constituency and polling location that apply to you. Finding a nearby village on our illustrative map does not establish where you are entitled to vote.",
          "Being old enough, having a document and being on the register are distinct questions. Consult the PEO for the eligibility rules and documents that apply to your circumstances.",
        ],
        sources: ["peo", "registration"],
      },
      {
        title: "Prepare three questions for the PEO",
        paragraphs: [
          "Am I on the relevant list with the correct details? Where and when should I vote? What identification or other documents must I bring? Check current notices before travelling.",
          "We could not re-fetch the live registration guidance during this review. Current document requirements, fees, cut-off dates and special arrangements should therefore be confirmed directly, rather than inferred from the 2022 report.",
        ],
        sources: ["registration", "peo"],
      },
      {
        title: "Why registration statistics differ",
        paragraphs: [
          "A register is an administrative list at a particular date. Population is a different measure. An election report may also include police electors or additions that are not included in a published non-police snapshot.",
          "On our register page, read the coverage note before comparing totals. The arithmetic difference between snapshots does not tell us why an entry was added, transferred or removed.",
        ],
        sources: ["documents", "population"],
      },
    ],
    example: {
      title: "Illustration: a growing list",
      text: "A list starts at 1,000. If 80 registrations are added and the next list contains 1,050, the remaining difference is 30. That is an unexplained net adjustment until the publisher explains transfers, removals and coverage; it is not proof of 30 deaths.",
    },
    misconception:
      "An old voter card, a place on a previous list or a map pin confirms every current voting arrangement. Check the current official record.",
    exercise: {
      question:
        "Can the nearest polling-place marker confirm where you should vote?",
      answer:
        "No. Our maps explain recorded geography. Confirm your assigned polling arrangements with the PEO.",
    },
    next: [
      { href: "https://www.peogrenada.org/", label: "Check with the PEO" },
      { href: "/register", label: "Understand the voter register" },
      { href: "/constituencies", label: "Explore constituencies" },
    ],
  },
  {
    slug: "constituencies-and-representation",
    title: "Constituencies and representation",
    question: "How does my area connect to Parliament?",
    answer:
      "A constituency is an electoral area represented in the House. Polling divisions and stations organise the local voting records; they do not each elect an additional MP.",
    keywords: [
      "MP",
      "constituency",
      "polling division",
      "boundaries",
      "representation",
      "parish",
    ],
    sections: [
      {
        title: "Three levels of detail",
        paragraphs: [
          "Read a national result for the country, a constituency result for the race to represent an area, and a polling-station return for a smaller part of that count. Keep those levels separate when comparing figures.",
          "A polling division can contain more than one station. Before adding rows, check that they cover distinct stations and that a repeated page has not duplicated the same votes.",
        ],
        sources: ["report2022"],
      },
      {
        title: "An election result is a snapshot",
        paragraphs: [
          "Who won a constituency at an election and which party a member later affiliates with are different facts. Our constituency histories preserve the election result; the current-election timeline identifies subsequent changes and their sources.",
          "A person’s record may span differently written names. Historical identity matches are provisional where the archive has not independently established that they refer to the same person.",
        ],
        sources: ["documents"],
      },
      {
        title: "Use the maps for exploration",
        paragraphs: [
          "The archive does not contain authoritative boundary files. The displayed shapes are reconstructed, and some divisions are unplaced. Do not use these shapes to settle a boundary or determine voting eligibility.",
          "Early elections had fewer constituencies. Their results retain historical names rather than being assigned to today’s map.",
        ],
        sources: ["documents"],
      },
    ],
    example: {
      title: "Illustration: part of a constituency",
      text: "If three distinct stations report 100, 200 and 300 valid votes, their combined total is 600. If a fourth station is missing, 600 is only the known subtotal. Calling it the constituency total would conceal missing data.",
    },
    misconception:
      "A constituency that voted 60% for a party tells us that every village, age group or individual voted the same way. Aggregate results do not identify individual choices.",
    exercise: {
      question:
        "If one polling station is missing, should its votes be entered as zero?",
      answer:
        "No. Missing means unknown. Preserve the gap and use an independently published constituency total if available, with its own source.",
    },
    next: [
      { href: "/constituencies", label: "Find your constituency" },
      { href: "/sources", label: "Inspect the boundary gaps" },
    ],
  },
  {
    slug: "parliament-and-government",
    title: "Parliament and government",
    question: "What happens after the votes are counted?",
    answer:
      "Election results establish the elected House. Government formation concerns who can command its support. Parliament and Cabinet have different roles.",
    keywords: [
      "senate",
      "cabinet",
      "prime minister",
      "governor general",
      "opposition",
      "government",
      "hung parliament",
    ],
    sections: [
      {
        title: "Know the institutions",
        paragraphs: [
          "Parliament includes the Crown, represented by the Governor-General, the Senate and the House of Representatives. The Senate’s 13 members are appointed; voters do not elect them on the general-election ballot.",
          "Parliament debates legislation and scrutinises government. Cabinet brings together the Prime Minister and other ministers. An MP, a senator and a minister are not interchangeable descriptions.",
        ],
        sources: ["parliament"],
      },
      {
        title: "Majority support matters",
        paragraphs: [
          "Section 58 governs appointment of the Prime Minister; section 59 addresses Cabinet. Read those provisions when interpreting claims about who is entitled to govern.",
          "Count support carefully. The largest party and a party with more than half the seats are not necessarily the same thing. A forecast of seats is not evidence that an appointment has happened.",
        ],
        sources: ["constitution"],
      },
      {
        title: "Follow decisions back to records",
        paragraphs: [
          "Distinguish a campaign proposal from a bill, and a bill from an enacted law. A party’s announcement establishes its stated intention; parliamentary and legal records establish the subsequent institutional action.",
          "Use Parliament’s records to investigate proceedings and use the relevant published law for a legal rule. A headline alone is not the full text of either.",
        ],
        sources: ["parliament", "constitution"],
      },
    ],
    example: {
      title: "Illustration: largest is not a majority",
      text: "In a 15-seat House split 7–5–3, the party with seven seats is the largest but does not have more than half. Eight is the arithmetic majority threshold. The numbers alone do not establish which member can command support.",
    },
    misconception:
      "Winning the most seats always means holding a majority. Seven can be the largest of three totals while remaining less than half of 15.",
    exercise: {
      question: "Is a 7–5–3 result a seven-seat majority?",
      answer:
        "No. Seven is a plurality of the seats in this example. A majority of 15 is eight; government formation depends on the applicable constitutional process and support.",
    },
    next: [
      { href: "/learn/how-elections-work", label: "Revisit votes and seats" },
      {
        href: "https://grenadaparliament.gd/",
        label: "Read Parliament’s records",
      },
    ],
  },
  {
    slug: "counting-and-results",
    title: "Counting and understanding results",
    question: "What exactly does an election number count?",
    answer:
      "Always name the numerator and denominator. Votes for a candidate, valid votes, ballots cast and registered electors are different quantities.",
    keywords: [
      "count",
      "recount",
      "valid",
      "rejected",
      "turnout",
      "margin",
      "percentage points",
      "result",
    ],
    sections: [
      {
        title: "Follow the record through the count",
        paragraphs: [
          "The PEO’s 2022 report describes voting, counting and the recorded returns. For a live election, keep provisional reports separate from a declared or certified outcome. Do not infer a final result from an incomplete count.",
          "Our historical archive checks station sums against separately published constituency and national totals. Where they disagree, it preserves the discrepancy rather than silently rewriting an official record.",
        ],
        sources: ["report2022", "report2018"],
      },
      {
        title: "Choose the right denominator",
        paragraphs: [
          "Candidate vote share is candidate votes divided by all valid candidate votes. Turnout is ballots cast divided by registered electors. Rejected ballots can contribute to participation without belonging to a candidate’s valid vote total.",
          "Some older records omit rejected ballots. A valid-votes-to-register ratio is labelled as a proxy here; it is not automatically comparable with full turnout.",
        ],
        sources: ["documents"],
      },
      {
        title: "A margin is a difference",
        paragraphs: [
          "The vote majority is the winner’s vote count minus the runner-up’s. A percentage-point margin subtracts their shares. A percentage change divides a change by its starting value; it answers a different question.",
          "When returns arrive in an uneven order, the early lead need not represent the uncounted areas. Our 2022 replay is a simulation, not a recovered chronology of the real count.",
        ],
        sources: ["report2022"],
      },
    ],
    example: {
      title: "Illustration: three valid percentages",
      text: "Out of 1,000 registered electors, 800 cast ballots, 20 are rejected and 780 are valid. Turnout is 800 ÷ 1,000 = 80%. A candidate with 390 votes has 390 ÷ 780 = 50% of valid votes, but 39% of registered electors. Each percentage needs its denominator.",
    },
    misconception:
      "A candidate’s 50% share means half the registered population voted for them. It usually means half the valid votes in that contest.",
    exercise: {
      question:
        "A share rises from 40% to 45%. Is that a five per cent increase?",
      answer:
        "It rises by five percentage points. Relative to the starting 40%, the increase is 5 ÷ 40 = 12.5%. State which measure you mean.",
    },
    next: [
      { href: "/trends", label: "Read the results explainer" },
      { href: "/how-close", label: "Experiment with margins and swing" },
      { href: "/results", label: "Inspect the returns" },
    ],
  },
  {
    slug: "referendums",
    title: "Understanding referendums",
    question: "How is voting on a question different from electing an MP?",
    answer:
      "Read the proposition, the applicable approval rule and the result for that question. A referendum vote concerns a proposal, not the election of a constituency representative.",
    keywords: [
      "referendum",
      "constitution",
      "CCJ",
      "Privy Council",
      "two thirds",
      "2016",
      "2018",
    ],
    sections: [
      {
        title: "Read the rule before the result",
        paragraphs: [
          "For the constitutional changes covered by section 39(5), approval requires at least two-thirds of valid votes in the referendum, alongside the other constitutional steps. Do not assume that a simple majority is sufficient for every proposal.",
        ],
        sources: ["constitution"],
      },
      {
        title: "Keep the questions separate",
        paragraphs: [
          "The 2016 archive covers seven bills. Adding Yes votes across all seven questions counts responses, not distinct people. A person could answer differently on different questions.",
          "The archived certified totals cover the combined responses. Per-bill figures currently rely on secondary reports and are labelled separately. The 2018 Gazette also has damaged pages, leaving some local results unreadable.",
        ],
        sources: ["documents"],
      },
      {
        title: "Explain what the result cannot establish",
        paragraphs: [
          "A No vote is a recorded choice on a proposition. The totals alone do not establish every voter’s reason or party affiliation. Comparing areas can show an association, but cannot identify individual motivations.",
        ],
        sources: ["documents"],
      },
    ],
    example: {
      title: "Illustration: an approval threshold",
      text: "If a rule requires two-thirds of valid votes and there are 900 valid responses, the threshold is 600. A Yes total of 540 is 60%—more than half, but below two-thirds. This illustrates the arithmetic, not a recorded referendum.",
    },
    misconception:
      "Summed Yes and No votes across seven questions equal the number of people who voted. They count responses to multiple questions.",
    exercise: {
      question:
        "Could 100 participants produce 700 valid responses across seven questions?",
      answer:
        "Yes, if every participant cast one valid response on each question. That would still be 100 participants, not 700 voters.",
    },
    next: [
      { href: "/referendums", label: "Explore Grenada’s referendums" },
      { href: "/sources", label: "Inspect missing certified results" },
    ],
  },
  {
    slug: "polls-and-predictions",
    title: "Polls, scenarios and uncertainty",
    question: "What can a prediction actually tell us?",
    answer:
      "A poll records answers from its respondents. A model transforms evidence and assumptions into possible outcomes. Neither is a count of votes cast in the election.",
    keywords: [
      "forecast",
      "probability",
      "poll",
      "sample",
      "uncertainty",
      "simulation",
      "backtest",
      "swing",
    ],
    sections: [
      {
        title: "Ask for the original report",
        paragraphs: [
          "Before interpreting a poll, look for the publisher, fieldwork dates, sample size, sampling method, exact questions, weighting and treatment of undecided respondents. If these are absent, the headline percentage cannot answer those questions for you.",
          "The current forecast lists missing original reports and methodology. A media summary of a poll remains a secondary report; it is not promoted to an official result.",
        ],
        sources: ["documents"],
      },
      {
        title: "Read a probability as a model statement",
        paragraphs: [
          "A modelled 60% chance is not a prediction of 60% of votes or seats. It describes the frequency of an outcome under the model’s simulation and assumptions. The model itself may be wrong.",
          "Change one input at a time to see what drives an outcome. Extra decimal places do not supply missing evidence about party support or local behaviour.",
        ],
        sources: [],
      },
      {
        title: "Learn from backtests without overclaiming",
        paragraphs: [
          "A backtest applies a method to past elections and compares outputs with known results. It can reveal weaknesses, but success on a small historical set does not guarantee the next election.",
          "Our model’s code, parameters, historical comparisons and missing inputs are documented on the forecast page. Treat its baseline as a stated scenario, and distinguish it from any scenario you create.",
        ],
        sources: [],
      },
    ],
    example: {
      title: "Illustration: chance is not vote share",
      text: "If a simulated party wins a majority in 600 of 1,000 runs, its modelled majority chance is 60%. Those runs do not tell us that it wins 60% of ballots. Changing the assumptions can change the frequency.",
    },
    misconception:
      "A high win probability makes losing impossible. Even a well-calibrated probability below 100% allows the other outcome; an uncalibrated model has additional uncertainty.",
    exercise: {
      question: "Does a modelled 70% win chance mean seven of ten seats?",
      answer:
        "No. It refers to the chance of the defined outcome under the model, not a seat allocation. Inspect the separate distribution of seat totals.",
    },
    next: [
      { href: "/forecast", label: "Inspect assumptions and backtests" },
      { href: "/make-your-map", label: "Build a scenario" },
      { href: "/how-close", label: "Try changing swing" },
    ],
  },
  {
    slug: "checking-election-claims",
    title: "Checking election claims",
    question: "How do I judge a number before sharing it?",
    answer:
      "Identify the claim, find its source, reproduce the comparison and ask what remains unknown. A source should support the exact statement—not merely discuss the same topic.",
    keywords: [
      "sources",
      "evidence",
      "misinformation",
      "fact check",
      "statistics",
      "demographics",
      "bias",
    ],
    sections: [
      {
        title: "Trace the statement to the record",
        paragraphs: [
          "For a result, look for an official return. For a party’s announcement, look for that party’s original publication. For a poll, look for the original report. These sources establish different things.",
          "Our source labels distinguish official, original-publisher, secondary and supplied information. A calculation is labelled with its inputs and formula; an illustration is not presented as a real event.",
        ],
        sources: ["documents"],
      },
      {
        title: "Check the comparison",
        paragraphs: [
          "Do both figures refer to the same geography, dates and population? Does one include rejected ballots or police electors while the other does not? A change in coverage can look like a change in behaviour.",
          "Population, the register and people who voted are different groups. Census tables provide demographic context, not evidence about how an age group, occupation or individual voted.",
        ],
        sources: ["population"],
      },
      {
        title: "Keep uncertainty visible",
        paragraphs: [
          "An official record can contain an error or conflict with another official record. Preserve both references and describe the conflict. Repeating a secondary figure in several places does not turn it into independent confirmation.",
          "In our official-data-only view, a calculation is withheld when required inputs are not officially supported. We do not replace missing votes with zero or recompute shares from only the candidates we can verify.",
        ],
        sources: ["documents"],
      },
    ],
    example: {
      title: "Illustration: a denominator changes the story",
      text: "A claim that support doubled from 10% to 20% describes a relative increase of 100%, but a rise of ten percentage points. Before sharing it, also check whether the two percentages use all respondents, decided voters or only two parties.",
    },
    misconception:
      "A chart with a citation must be correct. Check whether the citation supports the figure, the transformation and the conclusion.",
    exercise: {
      question:
        "If two official tables disagree, should we silently choose the tidier number?",
      answer:
        "No. Identify both records, explain which value is displayed and why, and preserve the discrepancy until it is resolved.",
    },
    next: [
      { href: "/sources", label: "Audit our evidence" },
      { href: "/trends", label: "Practise interpreting charts" },
    ],
  },
];
export function learningGuide(slug: string) {
  return GUIDES.find((guide) => guide.slug === slug);
}
