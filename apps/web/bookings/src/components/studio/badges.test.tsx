import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ExpiresSoonBadge } from "./badges";

describe("ExpiresSoonBadge", () => {
  it("says in words that the held time is about to end", () => {
    render(<ExpiresSoonBadge />);
    expect(screen.getByText("Expires soon")).toBeVisible();
  });
});
