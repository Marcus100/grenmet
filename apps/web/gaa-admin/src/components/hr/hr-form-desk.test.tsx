import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { SignedCopies } from "./hr-form-desk";

const NO_COPIES = /No signed copies yet/;

const documents = vi.hoisted(() => ({
  value: {
    data: {
      data: [
        {
          id: "d1",
          entity_type: "leave_request",
          entity_id: "e1",
          revision: 2,
          signer_name: "Tester",
          signed_at: "2026-10-01T14:00:00Z",
          sha256: "x",
        },
        {
          id: "d2",
          entity_type: "timesheet",
          entity_id: "e2",
          revision: 1,
          signer_name: "Tester",
          signed_at: "2026-10-02T14:00:00Z",
          sha256: "y",
        },
      ],
      count: 2,
    },
    isError: false,
    isPending: false,
  },
}));
vi.mock("./signatures/signature-api", () => ({
  useSignedDocuments: () => documents.value,
}));

it("lists only this form's signed copies with expand and download", () => {
  render(<SignedCopies entityType="leave_request" label="Leave Application" />);
  expect(screen.getByText("Revision 2")).toBeInTheDocument();
  expect(screen.queryByText("Revision 1")).toBeNull();
  expect(
    screen.getByRole("button", { name: "Expand Leave Application r2" })
  ).toBeEnabled();
  expect(
    screen.getByRole("button", { name: "Download Leave Application r2" })
  ).toBeEnabled();
});

it("says so when there are no signed copies of this form", () => {
  render(<SignedCopies entityType="parking_permit" label="Parking" />);
  expect(screen.getByText(NO_COPIES)).toBeInTheDocument();
});
