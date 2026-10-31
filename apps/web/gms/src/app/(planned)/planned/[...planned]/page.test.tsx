import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import PlannedPage from "./page";

const NOT_FOUND_STATUS = /404/;

const params = (planned: string[]) => Promise.resolve({ planned });

describe("planned page placeholders", () => {
  it("shows the placeholder for a planned link", async () => {
    render(await PlannedPage({ params: params(["weather", "map"]) }));
    expect(
      screen.getByRole("heading", { name: "Interactive map" })
    ).toBeInTheDocument();
  });

  it("is a 404 for any other URL, raised before anything streams", async () => {
    const thrown = await PlannedPage({
      params: params(["zzz-not-a-page"]),
    }).then(
      () => null,
      (error: unknown) => error
    );
    expect(thrown).toBeInstanceOf(Error);
    expect(thrown instanceof Error ? thrown.message : "").toMatch(
      NOT_FOUND_STATUS
    );
  });
});
