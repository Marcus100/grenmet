import { render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { CapDeskNavigation } from "@/navigation/cap-desk-navigation";
import { WarningRaisedNote } from "./warning-raised-note";

// A plain function, not vi.fn: vi.fn observes returned promises, which would
// report an intentional rejection as unhandled.
const lookup = vi.hoisted(() => ({
  calls: 0,
  impl: (): Promise<unknown> => Promise.resolve(null),
}));
vi.mock("@barrelsgd/api-client", () => ({
  capGetEscalation: () => ({
    unwrap: () => {
      lookup.calls += 1;
      return lookup.impl();
    },
  }),
}));

it("links to the CAP alert raised from this alert", async () => {
  lookup.impl = () =>
    Promise.resolve({ alert_id: "alert-9", lifecycle_state: "DRAFT" });
  render(<WarningRaisedNote productId="p-1" />);
  const link = await screen.findByRole("link", { name: "open the CAP alert" });
  expect(link).toHaveAttribute("href", "/cap/admin/alert-9");
  expect(screen.getByRole("status")).toHaveTextContent("Warning raised");
});

it("links to the standalone desk when cutover is on", async () => {
  const alertId = "11111111-2222-4333-8444-555555555555";
  lookup.impl = () =>
    Promise.resolve({ alert_id: alertId, lifecycle_state: "DRAFT" });
  render(
    <CapDeskNavigation deskUrl="https://cap.test/desk">
      <WarningRaisedNote productId="p-1" />
    </CapDeskNavigation>
  );
  const link = await screen.findByRole("link", { name: "open the CAP alert" });
  expect(link).toHaveAttribute(
    "href",
    `https://cap.test/desk/alerts/${alertId}`
  );
});

it("shows nothing when no warning was raised", async () => {
  lookup.calls = 0;
  lookup.impl = () =>
    Promise.resolve({ alert_id: null, lifecycle_state: null });
  const { container } = render(<WarningRaisedNote productId="p-1" />);
  await waitFor(() => expect(lookup.calls).toBe(1));
  expect(container).toBeEmptyDOMElement();
});

it("shows nothing when the lookup fails", async () => {
  lookup.calls = 0;
  lookup.impl = () => Promise.reject(new Error("offline"));
  const { container } = render(<WarningRaisedNote productId="p-2" />);
  await waitFor(() => expect(lookup.calls).toBe(1));
  expect(container).toBeEmptyDOMElement();
});
