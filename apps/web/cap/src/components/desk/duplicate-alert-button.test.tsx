import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const router = { push: vi.fn(), refresh: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const actions = vi.hoisted(() => ({ duplicateAlertAsDraft: vi.fn() }));
vi.mock("@/app/desk/alerts/[id]/duplicate-action", () => actions);

import { DuplicateAlertButton } from "./duplicate-alert-button";

const ALERT = "11111111-2222-4333-8444-555555555555";
const COPY = "99999999-2222-4333-8444-555555555555";
const BUTTON = /duplicate as draft/i;
const NO_ACCESS = /No access to duplicate alerts/;
const NOT_UPDATE = /is not an Update of this warning/;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("DuplicateAlertButton", () => {
  it("says plainly that a copy is not an update", () => {
    render(<DuplicateAlertButton alertId={ALERT} canCreate />);
    expect(screen.getByText(NOT_UPDATE)).toBeInTheDocument();
  });

  it("shows a no-access state, not a hidden button, without cap.alert.create", () => {
    render(<DuplicateAlertButton alertId={ALERT} canCreate={false} />);
    expect(screen.getByRole("status")).toHaveTextContent(NO_ACCESS);
    expect(screen.queryByRole("button", { name: BUTTON })).toBeNull();
  });

  it("opens the new draft's editor after copying", async () => {
    actions.duplicateAlertAsDraft.mockResolvedValue({
      data: { id: COPY },
      ok: true,
    });
    render(<DuplicateAlertButton alertId={ALERT} canCreate />);
    fireEvent.click(screen.getByRole("button", { name: BUTTON }));
    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith(`/desk/alerts/${COPY}/edit`)
    );
    expect(actions.duplicateAlertAsDraft).toHaveBeenCalledWith(ALERT);
  });

  it("shows the refusal and stays on the alert", async () => {
    actions.duplicateAlertAsDraft.mockResolvedValue({
      error: {
        items: [],
        kind: "state",
        status: 409,
        title: "The alert is no longer in a state that allows this. Reload it.",
      },
      ok: false,
    });
    render(<DuplicateAlertButton alertId={ALERT} canCreate />);
    fireEvent.click(screen.getByRole("button", { name: BUTTON }));
    expect(
      await screen.findByText(
        "The alert is no longer in a state that allows this. Reload it."
      )
    ).toBeInTheDocument();
    expect(router.push).not.toHaveBeenCalled();
  });
});
