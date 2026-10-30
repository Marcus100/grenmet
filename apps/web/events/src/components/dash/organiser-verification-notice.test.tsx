import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resubmitOrganiser } from "@/data/actions";
import { OrganiserVerificationNotice } from "./organiser-verification-notice";

const refresh = vi.fn();

vi.mock("@/data/actions", () => ({ resubmitOrganiser: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/dash",
  useRouter: () => ({ push: vi.fn(), refresh }),
}));

const SENT_BACK = /Sent back for review/u;
const NOTHING_TO_RESUBMIT = /Nothing to resubmit/u;

describe("OrganiserVerificationNotice", () => {
  beforeEach(() => {
    refresh.mockReset();
    vi.mocked(resubmitOrganiser).mockReset();
  });

  it("keeps the awaiting-verification notice and a 44px resubmit action", () => {
    render(<OrganiserVerificationNotice name="Island Beats" />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Island Beats is awaiting verification"
    );
    expect(
      screen.getByRole("button", { name: "Resubmit for review" })
    ).toHaveClass("h-11");
  });

  it("resubmits, announces it, focuses the message and refreshes", async () => {
    vi.mocked(resubmitOrganiser).mockResolvedValue({
      ok: true,
      data: "resubmitted",
    });
    render(<OrganiserVerificationNotice name="Island Beats" />);
    fireEvent.click(
      screen.getByRole("button", { name: "Resubmit for review" })
    );
    const message = await screen.findByText(SENT_BACK);
    expect(message).toHaveAttribute("role", "status");
    await vi.waitFor(() => expect(message).toHaveFocus());
    expect(refresh).toHaveBeenCalled();
  });

  it("explains an unchanged outcome instead of failing", async () => {
    vi.mocked(resubmitOrganiser).mockResolvedValue({
      ok: true,
      data: "unchanged",
    });
    render(<OrganiserVerificationNotice name="Island Beats" />);
    fireEvent.click(
      screen.getByRole("button", { name: "Resubmit for review" })
    );
    expect(await screen.findByText(NOTHING_TO_RESUBMIT)).toBeInTheDocument();
  });

  it("shows a refusal as a focused alert", async () => {
    vi.mocked(resubmitOrganiser).mockResolvedValue({
      ok: false,
      error: "You can't do that here",
    });
    render(<OrganiserVerificationNotice name="Island Beats" />);
    fireEvent.click(
      screen.getByRole("button", { name: "Resubmit for review" })
    );
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("You can't do that here");
    await vi.waitFor(() => expect(alert).toHaveFocus());
  });
});
