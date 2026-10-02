import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Atlas } from "@/components/atlas/atlas";
import { buildAtlas } from "@/data/atlas";
import { data, geo, results } from "@/data/load";

vi.mock("server-only", () => ({}));

const atlas = buildAtlas(data, geo, results);
const PREVIOUS = "Previous election or referendum";
const NEXT = "Next election or referendum";

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderAtlas(url = "/results?view=flat") {
  window.history.replaceState(null, "", url);
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, json: async () => atlas })
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
    screen.getByRole("button", { name: "Constituencies" })
  ).toHaveAttribute("aria-pressed", "true");
});

it("opens legacy 3D links in Map view without losing the event or constituency", async () => {
  await renderAtlas("/results?e=2018&c=n&view=3d");
  expect(screen.getByRole("button", { name: "Map" })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  expect(window.location.search).toContain("e=2018");
  expect(window.location.search).toContain("c=n");
  expect(window.location.search).not.toContain("3d");
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
  ]) {
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
