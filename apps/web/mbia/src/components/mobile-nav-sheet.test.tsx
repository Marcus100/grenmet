import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MobileNavSheet } from "@/components/mobile-nav-sheet";

describe("MobileNavSheet", () => {
  it("keeps a visible Call button, since the phone number is hidden on phones", () => {
    render(
      <MobileNavSheet
        onOpenChange={vi.fn()}
        open
        returnFocusRef={{ current: null }}
      />
    );
    const call = screen.getByRole("link", { name: "Call +1 (473) 444-4555" });
    expect(call).toHaveAttribute("href", "tel:+14734444555");
  });
});
