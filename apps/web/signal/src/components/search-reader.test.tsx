import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { SearchReader } from "./search-reader";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("searches locally, links to original URLs and explains empty results", async () => {
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  const user = userEvent.setup();
  render(
    <SearchReader
      entries={[
        {
          href: "/weather-ready/dust",
          title: "Dust over Grenada",
          description: "Hazy skies",
          label: "Weather",
        },
      ]}
    />
  );
  const input = screen.getByRole("searchbox", {
    name: "Search stories and editions",
  });
  expect(screen.getByRole("status")).toHaveTextContent("Type a topic");
  await user.type(input, "dust");
  expect(screen.getByRole("status")).toHaveTextContent("1 result");
  expect(
    screen.getByRole("link", { name: "Dust over Grenada" })
  ).toHaveAttribute("href", "/weather-ready/dust");
  await user.clear(input);
  await user.type(input, "absent");
  expect(screen.getByRole("status")).toHaveTextContent("0 results");
  expect(
    screen.getByRole("link", { name: "browse the topics" })
  ).toHaveAttribute("href", "/topics");
  expect(fetchMock).not.toHaveBeenCalled();
});
