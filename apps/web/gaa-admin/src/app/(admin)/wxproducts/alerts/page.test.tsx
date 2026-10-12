import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ desk: vi.fn() }));
vi.mock("@/components/wxproducts/product-desk", () => ({
  ProductDesk: (props: { title: string; initialKind: string }) => {
    mocks.desk(props);
    return <h1>{props.title}</h1>;
  },
}));

import Page from "./page";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it("includes the outlook editor and all existing bulletin kinds under Alerts", async () => {
  render(
    await Page({
      searchParams: Promise.resolve({
        kind: "outlook",
        sources: "source-a,source-b",
      }),
    })
  );
  expect(screen.getByRole("heading", { name: "Alerts" })).toBeInTheDocument();
  expect(mocks.desk).toHaveBeenCalledWith(
    expect.objectContaining({
      initialKind: "outlook",
      sourceEditionIds: ["source-a", "source-b"],
      kinds: expect.arrayContaining(["outlook", "marine", "cyclone"]),
    })
  );
});
it("keeps marine as the default editor", async () => {
  await Page({ searchParams: Promise.resolve({ kind: "unknown" }) });
  const content = await Page({ searchParams: Promise.resolve({}) });
  render(content);
  expect(mocks.desk).toHaveBeenCalledWith(
    expect.objectContaining({ initialKind: "marine" })
  );
});
