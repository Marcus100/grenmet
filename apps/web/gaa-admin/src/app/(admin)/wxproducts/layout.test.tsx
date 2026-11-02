import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const load = vi.hoisted(() => vi.fn());
vi.mock("@/db/cap/queries", () => ({ loadGmsCatalogue: load }));
vi.mock("@/lib/report-error", () => ({ reportError: vi.fn() }));

import { reportError } from "@/lib/report-error";
import WxproductsLayout from "./layout";

describe("wxproducts layout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("still renders the page when the catalogue cannot load", async () => {
    load.mockRejectedValue(new Error("403 Forbidden"));

    const element = await WxproductsLayout({ children: <p>Forecast list</p> });
    render(element);

    expect(screen.getByText("Forecast list")).toBeInTheDocument();
    expect(reportError).toHaveBeenCalledTimes(1);
  });
});
