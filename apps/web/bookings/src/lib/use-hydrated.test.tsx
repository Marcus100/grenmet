// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { useHydrated } from "./use-hydrated";

function Probe() {
  return <p>{useHydrated() ? "hydrated" : "waiting"}</p>;
}

describe("useHydrated", () => {
  it("is false in server HTML, before the client takes over", () => {
    expect(renderToString(<Probe />)).toContain("waiting");
  });

  it("is true once the client renders", () => {
    render(<Probe />);
    expect(screen.getByText("hydrated")).toBeInTheDocument();
  });
});
