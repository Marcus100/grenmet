import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { sendMessage } from "@/data/actions";
import { MessageComposer } from "./message-composer";

vi.mock("@/data/actions", () => ({ sendMessage: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/messages/t1",
  useRouter: () => ({ push: vi.fn() }),
}));

describe("MessageComposer", () => {
  beforeEach(() => {
    vi.mocked(sendMessage).mockReset();
  });

  it("is locked when the safety rule does not allow messaging", () => {
    render(<MessageComposer disabled threadId="t1" />);
    expect(screen.getByLabelText("Message")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  });

  it("sends the trimmed message to the thread and clears the draft", async () => {
    vi.mocked(sendMessage).mockResolvedValue({ ok: true, data: undefined });
    render(<MessageComposer disabled={false} threadId="t1" />);
    fireEvent.change(screen.getByLabelText("Message"), {
      target: { value: "  See you Thursday " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() =>
      expect(sendMessage).toHaveBeenCalledWith("t1", "See you Thursday")
    );
    await waitFor(() =>
      expect(screen.getByLabelText("Message")).toHaveValue("")
    );
  });

  it("keeps the draft and shows the API's reason when sending fails", async () => {
    vi.mocked(sendMessage).mockResolvedValue({
      ok: false,
      error: "You can't message this person",
    });
    render(<MessageComposer disabled={false} threadId="t1" />);
    fireEvent.change(screen.getByLabelText("Message"), {
      target: { value: "Hello" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "You can't message this person"
    );
    expect(screen.getByLabelText("Message")).toHaveValue("Hello");
  });
});
