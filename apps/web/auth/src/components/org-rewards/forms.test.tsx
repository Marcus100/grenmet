// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({
  confirmRedemptionAction: vi.fn(),
  createAchievementAction: vi.fn(),
}));
vi.mock("@/app/organisations/[organisationId]/rewards/actions", () => actions);
vi.mock("@/lib/org-rewards", () => ({}));
vi.mock("@/lib/report-error", () => ({ reportError: vi.fn() }));
vi.mock("@/components/account-layout", () => ({
  SettingsRow: () => null,
  SettingsSection: () => null,
  StatusBadge: () => null,
}));

import { AchievementForm } from "./achievement-form";
import { RedeemForm } from "./redemptions-section";

const TRAIL = "11111111-1111-4111-8111-111111111111";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function type(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

describe("redemption confirm form", () => {
  it("posts the code with the organisation and shows the success text", async () => {
    actions.confirmRedemptionAction.mockResolvedValue({
      message: "Confirmed: Coffee card.",
      status: "ok",
    });
    render(<RedeemForm organisationId="org_1" />);
    type("Customer's one-time code", "AB12CD34");
    fireEvent.click(screen.getByRole("button", { name: "Confirm redemption" }));
    const message = await screen.findByRole("status");
    expect(message.textContent).toContain("Confirmed: Coffee card.");
    const [, data] = actions.confirmRedemptionAction.mock.calls[0] as [
      unknown,
      FormData,
    ];
    expect(data.get("code")).toBe("AB12CD34");
    expect(data.get("organisation_id")).toBe("org_1");
  });

  it("shows the generic error for a code that isn't valid, and keeps what was typed", async () => {
    actions.confirmRedemptionAction.mockResolvedValue({
      message:
        "That code isn't valid for this organisation, or it was already used.",
      status: "error",
    });
    render(<RedeemForm organisationId="org_1" />);
    type("Customer's one-time code", "ZZZZZZZZ");
    fireEvent.click(screen.getByRole("button", { name: "Confirm redemption" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Not done: ");
    expect(alert.textContent).toContain("or it was already used");
    expect(
      (screen.getByLabelText("Customer's one-time code") as HTMLInputElement)
        .value
    ).toBe("ZZZZZZZZ");
  });
});

describe("achievement form", () => {
  it("asks for the parameter that matches the rule", () => {
    render(<AchievementForm organisationId="org_1" trails={[]} />);
    expect(screen.getByLabelText("Events needed")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Earned when someone"), {
      target: { value: "streak_days" },
    });
    expect(screen.queryByLabelText("Events needed")).toBeNull();
    expect(screen.getByLabelText("Days in a row")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Earned when someone"), {
      target: { value: "visited_all_stops_of_trail" },
    });
    expect(screen.getByLabelText("Trail")).toBeTruthy();
    expect(
      screen.getByText("Create a trail first, then come back.")
    ).toBeTruthy();
  });

  it("stops a bad parameter client-side and never calls the action", () => {
    render(<AchievementForm organisationId="org_1" trails={[]} />);
    type("Key", "regular");
    type("Name", "Regular");
    type("Events needed", "5000");
    fireEvent.click(screen.getByRole("button", { name: "Create achievement" }));
    expect(screen.getByRole("alert").textContent).toContain("from 1 to 1000");
    expect(actions.createAchievementAction).not.toHaveBeenCalled();
  });

  it("rejects a malformed key and a missing trail", () => {
    render(<AchievementForm organisationId="org_1" trails={[]} />);
    type("Key", "Not A Key");
    type("Name", "Regular");
    fireEvent.click(screen.getByRole("button", { name: "Create achievement" }));
    expect(screen.getByRole("alert").textContent).toContain("hyphens");
    type("Key", "regular");
    fireEvent.change(screen.getByLabelText("Earned when someone"), {
      target: { value: "visited_all_stops_of_trail" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create achievement" }));
    expect(screen.getByRole("alert").textContent).toContain("Choose the trail");
  });

  it("submits valid parameters and shows the API's error text", async () => {
    actions.createAchievementAction.mockResolvedValue({
      message: "Trail not found",
      status: "error",
    });
    render(
      <AchievementForm
        organisationId="org_1"
        trails={[{ id: TRAIL, name: "Island trail" }]}
      />
    );
    type("Key", "island-explorer");
    type("Name", "Island Explorer");
    fireEvent.change(screen.getByLabelText("Earned when someone"), {
      target: { value: "visited_all_stops_of_trail" },
    });
    fireEvent.change(screen.getByLabelText("Trail"), {
      target: { value: TRAIL },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create achievement" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Trail not found");
    const [, data] = actions.createAchievementAction.mock.calls[0] as [
      unknown,
      FormData,
    ];
    expect(data.get("rule_type")).toBe("visited_all_stops_of_trail");
    expect(data.get("trail_id")).toBe(TRAIL);
  });
});
