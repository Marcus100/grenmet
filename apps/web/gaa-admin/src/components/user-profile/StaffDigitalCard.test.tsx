import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DigitalStaffCard } from "./StaffDigitalCard";

const card = {
  user_id: "staff-1",
  number: "GAA-PERMANENT-ID",
  name: "Eugine Whint",
  department: "Meteorological Department",
  grade: "Manager",
  status: "active",
  email_verified: true,
  account_approved: true,
  employment_ready: false,
};
describe("Digital ID", () => {
  it("separates an active credential from pending HR details", () => {
    render(<DigitalStaffCard card={card} />);
    expect(screen.getByText("Active credential")).toBeInTheDocument();
    expect(screen.getByText("Pending completion")).toBeInTheDocument();
    expect(screen.getByText("Eugine Whint")).toBeInTheDocument();
  });
  it("copies the permanent identifier", async () => {
    const copy = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: copy },
    });
    render(<DigitalStaffCard card={card} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy staff ID" }));
    expect(await screen.findByText("Staff ID copied.")).toBeInTheDocument();
    expect(copy).toHaveBeenCalledWith(card.number);
  });
});
