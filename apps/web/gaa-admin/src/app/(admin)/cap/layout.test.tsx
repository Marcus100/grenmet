import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const load = vi.hoisted(() => vi.fn());
vi.mock("@/db/cap/queries", () => ({ loadGmsCatalogue: load }));
vi.mock("@/lib/report-error", () => ({ reportError: vi.fn() }));

import { reportError } from "@/lib/report-error";
import CapLayout from "./layout";

describe("cap layout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("still renders the page when the catalogue cannot load", async () => {
    load.mockRejectedValue(new Error("403 Forbidden"));

    const element = await CapLayout({ children: <p>Alert board</p> });
    render(element);

    expect(screen.getByText("Alert board")).toBeInTheDocument();
    expect(reportError).toHaveBeenCalledTimes(1);
  });
});
