import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RecordsTabs } from "./records-tabs";

const mockPathname = vi.hoisted(() => ({ value: "/hr/training" }));
vi.mock("next/navigation", () => ({ usePathname: () => mockPathname.value }));

describe("RecordsTabs", () => {
  it("links the three records sections and marks the current one", () => {
    render(<RecordsTabs />);

    expect(screen.getByRole("link", { name: "Documents" })).toHaveAttribute(
      "href",
      "/hr/documents"
    );
    expect(screen.getByRole("link", { name: "Parking" })).toHaveAttribute(
      "href",
      "/hr/parking"
    );
    expect(screen.getByRole("link", { name: "Training" })).toHaveAttribute(
      "aria-current",
      "page"
    );
    expect(screen.getByRole("link", { name: "Documents" })).not.toHaveAttribute(
      "aria-current"
    );
  });
});
