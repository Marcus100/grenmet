import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({
  saveHoursAction: vi.fn(),
  saveProfileAction: vi.fn(),
  saveProviderAction: vi.fn(),
  saveServiceAction: vi.fn(),
}));
vi.mock("@/app/studio/[orgSlug]/settings/actions", () => actions);

import { HoursForm } from "./hours-form";
import { ProfileForm } from "./profile-form";
import { ProviderForm } from "./provider-form";
import { ServiceForm } from "./service-form";

const refused = (message: string) => ({
  status: "error",
  kind: "invalid",
  message,
  nextStep: "Fix it.",
});
const ADDRESS = /Booking address/;
const NAME = /Service name/;
const PRICE = "Price (XCD)";
const PROVIDER_NAME = /^Name$/;
const MONDAY_START = /Monday opens, period 1/;
const MONDAY_END = /Monday closes, period 1/;
const ZONE_WARNING = /keeps saved hours as clock times/;
const CURRENCY_WARNING = /Prices are not converted/;
const TIMEZONE = "Timezone";
const CURRENCY = "Currency";

describe("a refused save keeps what was typed", () => {
  it("profile (address in use)", async () => {
    actions.saveProfileAction.mockResolvedValue(refused("Address in use."));
    render(
      <ProfileForm orgSlug="sea-salt" profile={null} suggestedName="Sea Salt" />
    );
    fireEvent.change(screen.getByLabelText(ADDRESS), {
      target: { value: "taken-name" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Address in use."
    );
    expect(screen.getByLabelText(ADDRESS)).toHaveValue("taken-name");
  });

  it("service (money error)", async () => {
    actions.saveServiceAction.mockResolvedValue(refused("Bad price."));
    render(<ServiceForm currency="XCD" depositsAvailable orgSlug="sea-salt" />);
    fireEvent.change(screen.getByLabelText(NAME), { target: { value: "Cut" } });
    fireEvent.change(screen.getByLabelText(PRICE), {
      target: { value: "1,5" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add service" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Bad price.");
    expect(screen.getByLabelText(NAME)).toHaveValue("Cut");
    expect(screen.getByLabelText(PRICE)).toHaveValue("1,5");
  });

  it("provider", async () => {
    actions.saveProviderAction.mockResolvedValue(refused("Nope."));
    render(<ProviderForm orgSlug="sea-salt" services={[]} />);
    fireEvent.change(screen.getByLabelText(PROVIDER_NAME), {
      target: { value: "Maya" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add provider" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByLabelText(PROVIDER_NAME)).toHaveValue("Maya");
  });

  it("hours (overlap)", async () => {
    actions.saveHoursAction.mockResolvedValue(refused("Monday: overlap."));
    render(
      <HoursForm
        hours={[]}
        orgSlug="sea-salt"
        providerId="p"
        zone="America/Grenada"
      />
    );
    fireEvent.change(screen.getByLabelText(MONDAY_START), {
      target: { value: "09:00" },
    });
    fireEvent.change(screen.getByLabelText(MONDAY_END), {
      target: { value: "12:00" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save weekly hours" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("overlap");
    expect(screen.getByLabelText(MONDAY_START)).toHaveValue("09:00");
    expect(screen.getByLabelText(MONDAY_END)).toHaveValue("12:00");
  });

  it("an add form still clears after a successful save", async () => {
    actions.saveProviderAction.mockResolvedValue({
      status: "done",
      message: "ok",
    });
    render(<ProviderForm orgSlug="sea-salt" services={[]} />);
    fireEvent.change(screen.getByLabelText(PROVIDER_NAME), {
      target: { value: "Maya" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add provider" }));
    await waitFor(() =>
      expect(screen.getByLabelText(PROVIDER_NAME)).toHaveValue("")
    );
  });
});

describe("profile change warnings", () => {
  it("warns when timezone or currency differs from the saved one", () => {
    const profile = {
      id: "x",
      organisation_id: "o",
      created_at: "",
      updated_at: "",
      public_slug: "sea-salt",
      display_name: "Sea Salt",
      timezone: "America/Grenada",
      currency: "XCD",
    } as never;
    render(
      <ProfileForm orgSlug="sea-salt" profile={profile} suggestedName="x" />
    );
    expect(screen.queryByText(ZONE_WARNING)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(TIMEZONE), {
      target: { value: "America/Barbados" },
    });
    fireEvent.change(screen.getByLabelText(CURRENCY), {
      target: { value: "TTD" },
    });
    expect(screen.getByText(ZONE_WARNING)).toBeInTheDocument();
    expect(screen.getByText(CURRENCY_WARNING)).toBeInTheDocument();
  });
});
