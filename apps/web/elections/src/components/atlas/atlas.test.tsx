import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Atlas } from "@/components/atlas/atlas";
import type { AtlasData } from "@/data/atlas";
import { buildAtlas } from "@/data/atlas";
import { data, geo, results } from "@/data/load";

vi.mock("server-only", () => ({}));

const atlas = buildAtlas(data, geo, results);
const PREVIOUS = "Previous election or referendum";
const NEXT = "Next election or referendum";
const N01 = /N01/u;
const DIVISION_N01 = /Polling division N01/u;
const UNSUPPORTED_YEAR =
  /Showing constituencies: polling-division results are unavailable for 2008/u;
const OMITTED_GEOMETRY =
  /Divisions without a matching measure or located geometry are omitted/u;
const UNAVAILABLE_MEASURES =
  /matching polling-division measures are unavailable/u;

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderAtlas(url = "/results?view=flat", payload: AtlasData = atlas) {
  window.history.replaceState(null, "", url);
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, json: async () => payload })
  );
  render(<Atlas />);
  return screen.findByRole("navigation", { name: "Election or referendum" });
}

describe("Results atlas navigation", () => {
  it("places the year selector before the map controls and steps across referendums", async () => {
    const timeline = await renderAtlas();
    const modes = screen.getByRole("group", { name: "Map shows" });
    expect(timeline.compareDocumentPosition(modes)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
    expect(
      within(timeline).getByRole("button", { name: "2022" })
    ).toHaveAttribute("aria-pressed", "true");
    expect(within(timeline).getByRole("button", { name: NEXT })).toBeDisabled();
    fireEvent.click(within(timeline).getByRole("button", { name: PREVIOUS }));
    expect(
      within(timeline).getByRole("button", { name: "2018 referendum" })
    ).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => expect(window.location.search).toContain("e=2018r"));
    fireEvent.click(within(timeline).getByRole("button", { name: NEXT }));
    expect(
      within(timeline).getByRole("button", { name: "2022" })
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("stops at the first event and switches the available metrics for referendums", async () => {
    const timeline = await renderAtlas();
    fireEvent.click(within(timeline).getByRole("button", { name: "1951" }));
    expect(
      within(timeline).getByRole("button", { name: PREVIOUS })
    ).toBeDisabled();
    fireEvent.click(
      within(timeline).getByRole("button", { name: "2016 referendum" })
    );
    expect(
      screen.getByRole("button", { name: "Yes vs No" })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Swing" })).toBeDisabled();
  });
});

it("zooms into a constituency with keyboard selection and returns to the national map", async () => {
  await renderAtlas();
  const constituency = screen.getByRole("button", { name: "St. Mark" });
  const map = constituency.closest("svg");
  const originalBox = map?.getAttribute("viewBox");
  fireEvent.keyDown(constituency, { key: "Enter" });
  expect(map?.getAttribute("viewBox")).not.toBe(originalBox);
  expect(window.location.search).toContain("c=n");
  const back = screen.getByRole("button", { name: "← All of Grenada" });
  fireEvent.click(back);
  expect(map?.getAttribute("viewBox")).toBe(originalBox);
});

it("offers Map and Seats, with constituency wording for referendums", async () => {
  const timeline = await renderAtlas();
  expect(screen.queryByRole("button", { name: "3D" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Map" })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  fireEvent.click(screen.getByRole("button", { name: "Seats" }));
  expect(window.location.search).toContain("view=tiles");
  fireEvent.click(
    within(timeline).getByRole("button", { name: "2018 referendum" })
  );
  expect(
    within(screen.getByRole("group", { name: "View" })).getByRole("button", {
      name: "Constituencies",
    })
  ).toHaveAttribute("aria-pressed", "true");
});

it("defaults to constituencies and offers national divisions with keyboard drill-down", async () => {
  await renderAtlas();
  const levels = screen.getByRole("group", { name: "Map level" });
  expect(
    within(levels).getByRole("button", { name: "Constituencies" })
  ).toHaveAttribute("aria-pressed", "true");
  expect(
    screen.queryByRole("button", { name: "Polling division N01" })
  ).not.toBeInTheDocument();
  fireEvent.click(
    within(levels).getByRole("button", { name: "Polling divisions" })
  );
  expect(
    screen.getByRole("heading", { name: "Results by polling division" })
  ).toBeInTheDocument();
  const path = screen.getByRole("button", { name: "Polling division N01" });
  const map = path.closest("svg");
  const nationalBox = map?.getAttribute("viewBox");
  expect(
    screen.getByRole("button", { name: "Polling division A01" })
  ).toBeInTheDocument();
  expect(window.location.search).toContain("level=div");
  fireEvent.keyDown(path, { key: "Enter" });
  expect(map?.getAttribute("viewBox")).not.toBe(nationalBox);
  expect(window.location.search).toContain("c=n");
  expect(window.location.search).toContain("d=n01");
  const panel = screen.getByRole("complementary", { name: "Results" });
  expect(
    within(panel).getByRole("link", { name: "St. Mark" })
  ).toBeInTheDocument();
  expect(within(panel).getByRole("button", { name: N01 })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  fireEvent.click(screen.getByRole("button", { name: "← All of Grenada" }));
  expect(map?.getAttribute("viewBox")).toBe(nationalBox);
  expect(
    screen.getByRole("heading", { name: "Results by polling division" })
  ).toBeInTheDocument();
});

it("falls back to constituencies for unsupported years and retains historical cards", async () => {
  const timeline = await renderAtlas("/results?e=2022&level=div");
  fireEvent.click(within(timeline).getByRole("button", { name: "2008" }));
  expect(screen.getByText(UNSUPPORTED_YEAR)).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Polling divisions" })
  ).toBeDisabled();
  expect(
    screen.queryByRole("button", { name: DIVISION_N01 })
  ).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "St. Mark" })).toBeInTheDocument();
  fireEvent.click(within(timeline).getByRole("button", { name: "1951" }));
  expect(
    screen.getByRole("region", { name: "Historical constituency results" })
  ).toBeInTheDocument();
});

it("omits unlocated, missing and mismatched division geometry while retaining recorded results", async () => {
  const payload = structuredClone(atlas);
  const n01 = payload.geo.divisions.N01;
  const n03 = payload.geo.divisions.N03;
  if (!(n01 && n03)) throw new Error("Expected St. Mark geometry");
  n01.located = false;
  payload.geo.divisions = Object.fromEntries(
    Object.entries(payload.geo.divisions).filter(([key]) => key !== "N02")
  );
  n03.cons = "A";
  await renderAtlas("/results?e=2022&level=div", payload);
  for (const code of ["N01", "N02", "N03"]) {
    expect(
      screen.queryByRole("button", { name: `Polling division ${code}` })
    ).not.toBeInTheDocument();
    expect(
      within(screen.getByRole("complementary", { name: "Results" })).getByRole(
        "button",
        { name: new RegExp(code, "u") }
      )
    ).toBeInTheDocument();
  }
  expect(screen.getByText(OMITTED_GEOMETRY)).toBeInTheDocument();
});

it("falls back for division swing without matching previous division measures", async () => {
  await renderAtlas("/results?e=2013&level=div&mode=swing");
  expect(
    screen.getByRole("button", { name: "Polling divisions" })
  ).toBeDisabled();
  expect(screen.getByText(UNAVAILABLE_MEASURES)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "St. Mark" })).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Polling division N01" })
  ).not.toBeInTheDocument();
});

it("colours divisions from their own votes rather than constituency totals", async () => {
  const payload = structuredClone(atlas);
  const event = payload.events.find((item) => item.id === "2022");
  const division = event?.divisions.find((item) => item.division === "N01");
  if (!(event && division)) throw new Error("Expected 2022 division result");
  division.c = [
    ["Division winner", "GULP", 100],
    ["Runner-up", "NNP", 1],
  ];
  event.results.N = {
    c: [["Constituency winner", "NNP", 200]],
    cast: 200,
    reg: 300,
    rej: 0,
  };
  document.documentElement.style.setProperty("--el-gulp", "#e0623e");
  document.documentElement.style.setProperty("--el-nnp", "#0b7a4b");
  try {
    await renderAtlas("/results?e=2022&level=div", payload);
    expect(
      screen.getByRole("button", { name: "Polling division N01" })
    ).toHaveAttribute("fill", "rgb(224 98 62)");
    fireEvent.click(
      within(screen.getByRole("group", { name: "Map level" })).getByRole(
        "button",
        { name: "Constituencies" }
      )
    );
    expect(screen.getByRole("button", { name: "St. Mark" })).toHaveAttribute(
      "fill",
      "rgb(11 122 75)"
    );
  } finally {
    document.documentElement.style.removeProperty("--el-gulp");
    document.documentElement.style.removeProperty("--el-nnp");
  }
});

it("explains the constituency fallback when division geometry is entirely absent", async () => {
  const payload = structuredClone(atlas);
  payload.geo.divisions = {};
  await renderAtlas("/results?e=2022&level=div", payload);
  expect(
    screen.getByRole("button", { name: "Polling divisions" })
  ).toBeDisabled();
  expect(
    screen.getByText(
      "Showing constituencies: matching polling-division geometry is unavailable for this selection."
    )
  ).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "St. Mark" })).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Polling division N01" })
  ).not.toBeInTheDocument();
});

it("opens legacy 3D links in Map view without losing the event or constituency", async () => {
  await renderAtlas("/results?e=2018&c=n&view=3d");
  expect(screen.getByRole("button", { name: "Map" })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  expect(window.location.search).toContain("e=2018");
  expect(window.location.search).toContain("c=n");
  await waitFor(() => {
    expect(window.location.search).toContain("e=2018");
    expect(window.location.search).toContain("c=n");
    expect(window.location.search).not.toContain("3d");
  });
});

it("distinguishes House seats from referendum vote shares in the national summary", async () => {
  const timeline = await renderAtlas();
  const summary = screen.getByRole("region", { name: "National result" });
  expect(summary).toHaveTextContent("8 seats needed for a majority");
  expect(within(summary).getByRole("img")).toHaveAccessibleName(
    "NDC 9 seats, NNP 6 seats"
  );
  fireEvent.click(
    within(timeline).getByRole("button", { name: "2018 referendum" })
  );
  expect(summary).not.toHaveTextContent("seats needed");
  expect(summary).toHaveTextContent("%");
});

it("shows all six earlier elections with historical names, source caveats and correct House sizes", async () => {
  const timeline = await renderAtlas();
  for (const [year, size, majority] of [
    [1951, 8, 5],
    [1954, 8, 5],
    [1957, 8, 5],
    [1961, 10, 6],
    [1962, 10, 6],
    [1967, 10, 6],
  ] as const) {
    fireEvent.click(
      within(timeline).getByRole("button", { name: String(year) })
    );
    expect(
      screen.queryByRole("group", { name: "Map shows" })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "National result" })
    ).toHaveTextContent(
      `${majority} seats needed for a majority · ${size} constituencies`
    );
    const historical = screen.getByRole("region", {
      name: "Historical constituency results",
    });
    expect(within(historical).getAllByRole("article")).toHaveLength(size);
    expect(
      within(historical).getByRole("heading", { name: "St. George's Town" })
    ).toBeInTheDocument();
    expect(historical).toHaveTextContent("different boundaries");
    expect(window.location.search).toContain(`e=${year}`);
  }
  fireEvent.click(within(timeline).getByRole("button", { name: "1954" }));
  expect(
    screen.getByText(
      "The Gazette’s last digit is unclear: it looks like 983, ElectionPassport gives 988."
    )
  ).toBeInTheDocument();
  fireEvent.click(within(timeline).getByRole("button", { name: "1972" }));
  expect(screen.getByRole("group", { name: "Map shows" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Swing" })).toBeDisabled();
  expect(
    screen.queryByRole("region", { name: "Historical constituency results" })
  ).not.toBeInTheDocument();
});

it("opens a shared historical year without applying modern constituency selections", async () => {
  await renderAtlas("/results?e=1962&c=n&d=N01&view=tiles");
  expect(
    screen.getByRole("region", { name: "Historical constituency results" })
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("complementary", { name: "Results" })
  ).not.toBeInTheDocument();
});
