import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  AlertLists,
  CapGroups,
  GreenSection,
  nothingInEffect,
  noWarningsLabel,
  WarningsBand,
} from "@/components/pages/warnings-status";
import type { AlertsResult, GreenStatus } from "@/lib/cap-alerts";
import type { GreenAlerts } from "@/lib/green-alerts";
import { greenStatus } from "@/lib/green-alerts";

/** An outlook that never answers: the warnings must still show. */
const OTHER_TWO = /2 other GMS alerts are in effect/u;
const GREEN_LEVEL = /Green level/u;
const CANNOT_RETRIEVE = /Green alerts cannot be retrieved right now/u;
const NEVER = new Promise<GreenAlerts>(() => undefined);
const CHECKED = new Date("2026-10-30T14:00:00Z");
const NO_WARNINGS: AlertsResult = { status: "ok", activeCount: 0, groups: [] };
const WARNING: AlertsResult = {
  status: "ok",
  activeCount: 1,
  groups: [
    {
      name: "Tropical Cyclone",
      alerts: [
        {
          identifier: "GD-1",
          event: "Hurricane Warning",
          headline: "Hurricane conditions expected",
          severity: "Extreme",
          status: "Actual",
          areas: [],
          expires: null,
        },
      ],
    },
  ],
};

const outlookOf = (
  overrides: Partial<Extract<GreenAlerts, { status: "ok" }>>
): Promise<GreenAlerts> =>
  Promise.resolve({
    status: "ok",
    complete: true,
    items: [],
    other: 0,
    information: [],
    ...overrides,
  } as GreenAlerts);

const ALL_CLEAR = {
  id: "all-clear",
  title: "Calm seas",
  when: "In effect until Mon 2 Nov",
  href: null,
};

describe("a warning does not wait for the GMS outlook", () => {
  it("shows the warning band at once, while the outlook is still being read", async () => {
    render(
      await WarningsBand({ alerts: WARNING, checkedAt: CHECKED, green: NEVER })
    );
    expect(screen.getByText("Take action now · 1 active")).toBeInTheDocument();
  });

  it("lists the warning at once, while the outlook is still being read", async () => {
    render(await CapGroups({ alerts: WARNING, green: NEVER }));
    expect(screen.getByText("Hurricane Warning")).toBeInTheDocument();
  });
});

describe("with no warning in effect, the outlook decides the wording", () => {
  it("names Green alerts in effect in the band", async () => {
    render(
      await WarningsBand({
        alerts: NO_WARNINGS,
        checkedAt: CHECKED,
        green: outlookOf({
          items: [
            {
              id: "a",
              title: "Calm seas",
              summary: "",
              when: "In effect",
              href: null,
            },
          ],
        }),
      })
    );
    expect(screen.getByText("Green level · 1 active")).toBeInTheDocument();
    expect(screen.getByRole("status")).not.toHaveTextContent(
      "No active alerts"
    );
  });

  it("says no alerts in effect only when the outlook is read in full and empty", async () => {
    render(
      await WarningsBand({
        alerts: NO_WARNINGS,
        checkedAt: CHECKED,
        green: outlookOf({}),
      })
    );
    expect(screen.getByRole("status")).toHaveTextContent("No active alerts");
  });

  it("is never an all-clear for an incomplete read with nothing listed", async () => {
    const { container } = render(
      await WarningsBand({
        alerts: NO_WARNINGS,
        checkedAt: CHECKED,
        green: outlookOf({ complete: false }),
      })
    );
    expect(
      screen.getByText("Alert information may be incomplete")
    ).toBeInTheDocument();
    expect(container.querySelector(".lucide-shield-check")).toBeNull();
  });

  it("says other GMS alerts are in effect, not that there are none", async () => {
    render(
      await WarningsBand({
        alerts: NO_WARNINGS,
        checkedAt: CHECKED,
        green: outlookOf({ other: 1 }),
      })
    );
    expect(screen.getByText("GMS alert in effect")).toBeInTheDocument();
    expect(screen.getByRole("status")).not.toHaveTextContent(
      "No active alerts"
    );
  });

  it("shows the Green list, and a note for other GMS alerts, once the outlook answers", async () => {
    render(
      await GreenSection({
        green: outlookOf({ other: 2 }),
      })
    );
    expect(screen.getByText(OTHER_TWO)).toBeInTheDocument();
  });

  it("says Green alerts could not be read, never that there are none", async () => {
    render(
      await GreenSection({
        green: Promise.resolve({ status: "unavailable" }),
      })
    );
    expect(screen.getByText(CANNOT_RETRIEVE)).toBeInTheDocument();
  });
});

describe("an All clear is information, not an alert in effect", () => {
  it("says No active alerts and lists the All clear as information", async () => {
    const green = outlookOf({ information: [ALL_CLEAR] });
    render(
      <>
        {
          await WarningsBand({
            alerts: NO_WARNINGS,
            checkedAt: CHECKED,
            green,
          })
        }
        {await GreenSection({ green })}
      </>
    );
    expect(screen.getByRole("status")).toHaveTextContent("No active alerts");
    expect(screen.getByText("All clear: Calm seas")).toBeInTheDocument();
    expect(screen.queryByText(GREEN_LEVEL)).toBeNull();
    expect(
      screen.getByText("No Green alerts are in effect.")
    ).toBeInTheDocument();
  });

  it("is grey, never an all-clear, for an incomplete read with an All clear", async () => {
    const { container } = render(
      await WarningsBand({
        alerts: NO_WARNINGS,
        checkedAt: CHECKED,
        green: outlookOf({ complete: false, information: [ALL_CLEAR] }),
      })
    );
    expect(
      screen.getByText("Alert information may be incomplete")
    ).toBeInTheDocument();
    expect(container.querySelector(".lucide-shield-check")).toBeNull();
  });

  it("lists the All clear beside Green alerts when both are in effect", async () => {
    render(
      await GreenSection({
        green: outlookOf({
          information: [ALL_CLEAR],
          items: [
            {
              id: "g",
              title: "Calm seas green",
              summary: "",
              when: "In effect",
              href: null,
            },
          ],
        }),
      })
    );
    expect(screen.getByText("Calm seas green")).toBeInTheDocument();
    expect(screen.getByText("All clear: Calm seas")).toBeInTheDocument();
  });
});

describe("noWarningsLabel", () => {
  const ok = (
    overrides: Partial<GreenStatus & { status: "ok" }>
  ): GreenStatus =>
    ({
      status: "ok",
      count: 0,
      other: 0,
      complete: true,
      ...overrides,
    }) as GreenStatus;

  it.each([
    ["no outlook answer yet", undefined, undefined],
    [
      "the outlook unreadable",
      { status: "unavailable" } as GreenStatus,
      "No warnings or watches are in effect. Green alerts could not be checked right now.",
    ],
    [
      "other GMS alerts",
      ok({ other: 1 }),
      "No warnings or watches are in effect. Other GMS alerts are in effect; see below.",
    ],
    [
      "an incomplete read with nothing listed",
      ok({ complete: false }),
      "No warnings or watches are in effect. Some alerts could not be read, so this may be incomplete.",
    ],
    [
      "Green alerts listed",
      ok({ count: 1 }),
      "No warnings or watches are in effect. Green alerts are listed below.",
    ],
    ["a read in full and empty", ok({}), undefined],
  ])("for %s", (_name, status, expected) => {
    expect(noWarningsLabel(status)).toBe(expected);
  });
});

describe("the page's lists when nothing is in effect", () => {
  it("says it once, as a two-line checklist of both lists", async () => {
    render(await AlertLists({ alerts: NO_WARNINGS, green: outlookOf({}) }));
    const list = screen.getByLabelText("Alerts checked");
    expect(list).toHaveTextContent("Warnings and watches:none in effect");
    expect(list).toHaveTextContent("Green alerts:none in effect");
    expect(
      screen.queryByRole("heading", { name: "Green alerts" })
    ).not.toBeInTheDocument();
  });
});

describe("the short checklist is never shown unless everything was read and is empty", () => {
  const statusOf = async (green: Promise<GreenAlerts>) =>
    greenStatus(await green);

  it("is shown when both lists were read in full and hold nothing", async () => {
    expect(nothingInEffect(NO_WARNINGS, await statusOf(outlookOf({})))).toBe(
      true
    );
  });

  it("is not shown while a warning is in effect", async () => {
    expect(nothingInEffect(WARNING, await statusOf(outlookOf({})))).toBe(false);
  });

  it("is not shown when the warning feed did not answer", async () => {
    expect(
      nothingInEffect({ status: "unavailable" }, await statusOf(outlookOf({})))
    ).toBe(false);
  });

  it("is not shown when the Green alerts could not be read", async () => {
    expect(
      nothingInEffect(
        NO_WARNINGS,
        await statusOf(Promise.resolve({ status: "unavailable" }))
      )
    ).toBe(false);
    expect(nothingInEffect(NO_WARNINGS, undefined)).toBe(false);
  });

  it("is not shown when the outlook is incomplete, lists a Green alert or has other GMS alerts", async () => {
    expect(
      nothingInEffect(
        NO_WARNINGS,
        await statusOf(outlookOf({ complete: false }))
      )
    ).toBe(false);
    expect(
      nothingInEffect(
        NO_WARNINGS,
        await statusOf(outlookOf({ items: [{ ...ALL_CLEAR, summary: "" }] }))
      )
    ).toBe(false);
    expect(
      nothingInEffect(NO_WARNINGS, await statusOf(outlookOf({ other: 2 })))
    ).toBe(false);
  });
});
