import { type RequestStatus, requestStatus } from "@barrelsgd/api-client";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  editingHint,
  isEditableStatus,
  RequestStatusBadge,
  ReturnedReason,
} from "./request-status";

describe("request status", () => {
  it("lets the author edit a draft or a returned form only", () => {
    expect(isEditableStatus(requestStatus.DRAFT)).toBe(true);
    expect(isEditableStatus(requestStatus.RETURNED)).toBe(true);
    const others: RequestStatus[] = [
      requestStatus.SUBMITTED,
      requestStatus.APPROVED,
      requestStatus.REJECTED,
      requestStatus.CANCELLED,
    ];
    for (const status of others) {
      expect(isEditableStatus(status)).toBe(false);
    }
  });

  it("writes Returned and Rejected differently, in words", () => {
    const { rerender } = render(<RequestStatusBadge status="RETURNED" />);
    const returned = screen.getByText("Returned").className;
    rerender(<RequestStatusBadge status="REJECTED" />);
    const rejected = screen.getByText("Rejected").className;
    expect(returned).not.toEqual(rejected);
  });

  it("shows the reason only while the form is returned", () => {
    const { rerender } = render(
      <ReturnedReason reason="Attach the form" status="RETURNED" />
    );
    expect(screen.getByText("Attach the form")).toBeInTheDocument();
    rerender(<ReturnedReason reason="Attach the form" status="SUBMITTED" />);
    expect(screen.queryByText("Attach the form")).not.toBeInTheDocument();
  });

  it("tells the author what to do with a returned form", () => {
    expect(
      editingHint({ status: "RETURNED", returned_reason: "Fix dates" })
    ).toBe("Returned for changes: Fix dates. Edit it and submit again.");
    expect(editingHint({ status: "DRAFT" })).toBe("Editing saved draft");
  });
});
