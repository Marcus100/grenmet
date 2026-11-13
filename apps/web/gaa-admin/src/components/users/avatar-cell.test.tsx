import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AvatarCell } from "./users-columns";

describe("AvatarCell", () => {
  it("shows initials until a photo loads, so a missing photo leaves them", () => {
    render(<AvatarCell lastActive={5} name="Synthetic Seven" userId="u7" />);
    expect(screen.getByText("SS")).toBeInTheDocument();
    // jsdom never loads images, as with a 404 from the photo route.
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});
