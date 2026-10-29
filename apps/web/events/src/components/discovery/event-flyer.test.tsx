import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PersonAvatar } from "@/components/community/person-avatar";
import { EventFlyer } from "./event-flyer";

const FILE = "0b9f3e2a-1111-4222-8333-444455556666";

describe("EventFlyer", () => {
  it("renders the stored cover through /files with size, alt and lazy loading", () => {
    render(
      <EventFlyer
        category="music"
        imageAlt="Cover image for Sunset"
        imageFileId={FILE}
        startsAt="2026-10-03T20:00:00Z"
      />
    );
    const image = screen.getByRole("img", { name: "Cover image for Sunset" });
    expect(image).toHaveAttribute("src", `/files/${FILE}`);
    expect(image).toHaveAttribute("loading", "lazy");
    expect(image).toHaveAttribute("width", "640");
    expect(image).toHaveAttribute("height", "480");
  });

  it("loads eagerly for the above-the-fold event page", () => {
    render(
      <EventFlyer
        category="music"
        imageFileId={FILE}
        priority
        startsAt="2026-10-03T20:00:00Z"
      />
    );
    expect(screen.getByRole("img")).toHaveAttribute("loading", "eager");
  });

  it("falls back to the category panel when there is no image", () => {
    const { container } = render(
      <EventFlyer category="music" startsAt="2026-10-03T20:00:00Z" />
    );
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(container.firstElementChild).toHaveClass("aspect-[4/3]");
  });
});

describe("PersonAvatar", () => {
  it("keeps initials as the fallback for an organiser without a logo", () => {
    render(<PersonAvatar name="Island Beats" />);
    expect(screen.getByText("IB")).toBeInTheDocument();
  });
});
