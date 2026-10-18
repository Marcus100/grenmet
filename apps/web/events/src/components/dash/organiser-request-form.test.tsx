import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { requestOrganiser } from "@/data/actions";
import { OrganiserRequestForm } from "./organiser-request-form";

const refresh = vi.fn();

vi.mock("@/data/actions", () => ({ requestOrganiser: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/dash",
  useRouter: () => ({ push: vi.fn(), refresh }),
}));

describe("OrganiserRequestForm", () => {
  it("submits the name and bio, then refreshes the console", async () => {
    vi.mocked(requestOrganiser).mockResolvedValue({
      ok: true,
      data: "island-beats",
    });
    render(<OrganiserRequestForm />);
    fireEvent.change(screen.getByLabelText("Organiser name"), {
      target: { value: "Island Beats" },
    });
    fireEvent.change(screen.getByLabelText("About you"), {
      target: { value: "Pop-ups" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Request organiser account" })
    );

    await vi.waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(requestOrganiser).toHaveBeenCalledWith({
      name: "Island Beats",
      bio: "Pop-ups",
    });
  });

  it("shows the API's message when the request is refused", async () => {
    vi.mocked(requestOrganiser).mockResolvedValue({
      ok: false,
      error: "Your organiser request is awaiting review",
    });
    render(<OrganiserRequestForm />);
    fireEvent.change(screen.getByLabelText("Organiser name"), {
      target: { value: "Again" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Request organiser account" })
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "awaiting review"
    );
  });
});
