/** Which colour family a party or referendum side is drawn in. */
export type PartyHue = "ndc" | "nnp" | "gulp" | "hist" | "other" | "yes" | "no";

interface PartyInfo {
  hue: PartyHue;
  name: string;
}

const PARTIES: Record<string, PartyInfo> = {
  NDC: { name: "National Democratic Congress", hue: "ndc" },
  NNP: { name: "New National Party", hue: "nnp" },
  GULP: { name: "Grenada United Labour Party", hue: "gulp" },
  MMWU: { name: "Grenada Manual and Mental Workers Union", hue: "gulp" },
  DPM: { name: "Democratic People’s Movement", hue: "gulp" },
  GNP: { name: "Grenada National Party", hue: "hist" },
  PA: { name: "People’s Alliance", hue: "hist" },
  TNP: { name: "The National Party", hue: "hist" },
  GRP: { name: "Grenada Renaissance Party", hue: "other" },
  IFP: { name: "Independent Freedom Party", hue: "other" },
  IND: { name: "Independent", hue: "other" },
  MBPM: { name: "Maurice Bishop Patriotic Movement", hue: "other" },
  ULP: { name: "United Labour Platform", hue: "other" },
  GOD: { name: "Good Old Democracy", hue: "other" },
  PLM: { name: "People’s Labour Movement", hue: "other" },
  PDM: { name: "People’s Democratic Movement", hue: "other" },
  PPM: { name: "People’s Progressive Movement", hue: "other" },
  GFLP: { name: "Grenada Federated Labour Party", hue: "other" },
  AC: { name: "Action Council", hue: "other" },
  URP: { name: "United Republican Party", hue: "other" },
  CDLP: { name: "Christian Democratic Labour Party", hue: "other" },
  MIC: { name: "Movement of Independent Candidates", hue: "other" },
  GUPM: { name: "Grenada United Patriotic Movement", hue: "other" },
  NUF: { name: "National United Front", hue: "other" },
  PULP: { name: "People United Labour Party", hue: "other" },
  YES: { name: "Yes", hue: "yes" },
  NO: { name: "No", hue: "no" },
};

export function partyInfo(code: string): PartyInfo {
  return PARTIES[code] ?? { name: code, hue: "other" };
}

/** CSS colour for a party: the fill, its text-safe `ink`, or its `tint`. */
export function partyColor(code: string, step?: "ink" | "tint"): string {
  const { hue } = partyInfo(code);
  return `var(--el-${hue}${step ? `-${step}` : ""})`;
}

/** Whether white text reads on this party's fill (otherwise use ink). */
export function partyFillIsDark(code: string): boolean {
  return ["nnp", "hist", "yes", "no"].includes(partyInfo(code).hue);
}
