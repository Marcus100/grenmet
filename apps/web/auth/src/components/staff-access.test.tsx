// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/actions", () => ({ requestStaffAccessAction: vi.fn() }));

import { StaffAccess } from "./staff-access";

afterEach(cleanup);

describe("StaffAccess", () => {
  it("offers the request to a public account", () => {
    render(<StaffAccess requestedAt={null} />);
    expect(
      screen.getByRole("button", { name: "Request staff access" })
    ).toBeTruthy();
  });

  it("confirms a request that's already been sent", () => {
    render(<StaffAccess requestedAt="2026-10-07T08:00:00Z" />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("Request sent")).toBeTruthy();
  });
});
