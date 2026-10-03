import { existsSync } from "node:fs";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { STORY_IMAGES } from "@/lib/story-images";
import { LeadStories } from "./lead-stories";
import { StoryImage } from "./story-image";

const ARCHIVE_CAPTION = /Archive satellite image/;
const FILE_CAPTION = /File photo/;
afterEach(cleanup);

it("renders a credited archive image with descriptive alt text and a local asset", () => {
  render(
    <StoryImage article={{ section: "weather-ready", slug: "saharan-dust" }} />
  );
  expect(screen.getByRole("img")).toHaveAttribute(
    "alt",
    STORY_IMAGES["weather-ready/saharan-dust"].alt
  );
  expect(screen.getByText(ARCHIVE_CAPTION)).toHaveTextContent("18 June 2020");
  expect(
    screen.getByRole("link", { name: "NASA / Public domain" })
  ).toHaveAttribute("href", STORY_IMAGES["weather-ready/saharan-dust"].source);
  for (const image of Object.values(STORY_IMAGES)) {
    expect(existsSync(`public${image.src}`)).toBe(true);
  }
});

it("adds no image frame or caption to an unselected story", () => {
  const { container } = render(
    <StoryImage article={{ section: "opportunity", slug: "scholarship" }} />
  );
  expect(container).toBeEmptyDOMElement();
});

it("shows selected lead photography with context while keeping its story link", () => {
  render(
    <LeadStories
      articles={[
        {
          section: "check-d-ting",
          slug: "water-shutdown-rumour",
          title: "Water claim checked",
          dek: "Demo summary",
          author: "Signal Desk",
          publishedAt: "2026-06-13",
        },
      ]}
    />
  );
  expect(screen.getByRole("img")).toHaveAttribute(
    "alt",
    "A droplet falling from an outdoor water tap"
  );
  expect(screen.getByText(FILE_CAPTION)).toHaveTextContent("Brazil, 2017");
  expect(
    screen.getByRole("link", { name: "Water claim checked" })
  ).toHaveAttribute("href", "/check-d-ting/water-shutdown-rumour");
});
