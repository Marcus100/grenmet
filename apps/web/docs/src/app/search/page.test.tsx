import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("content-collections", () => ({
  allHurricanepages: [
    {
      _meta: { path: "hurricane-plan" },
      description: "What to do before a storm",
      title: "Hurricane plan",
    },
    {
      _meta: { path: "appendix/mbia-vehicles" },
      description: "Vehicles that cross the airside",
      title: "Vehicles at MBIA",
    },
  ],
}));

const { default: SearchPage } = await import("./page");

async function renderSearch(q: string | string[] | undefined): Promise<string> {
  const element = await SearchPage({ searchParams: Promise.resolve({ q }) });
  return renderToStaticMarkup(element);
}

describe("docs /search", () => {
  it("asks for a word when there is no query", async () => {
    const html = await renderSearch(undefined);
    expect(html).toContain("Type a word, such as “hurricane”");
    expect(html).not.toContain("No pages match");
  });

  it("links each matching page to its public path", async () => {
    const html = await renderSearch("hurricane");
    expect(html).toContain('href="/hurricane-plan"');
    expect(html).toContain("Hurricane plan");
    expect(html).not.toContain("Vehicles at MBIA");
  });

  it("says plainly when no page matches, and links the documentation home", async () => {
    const html = await renderSearch("zzqxnothing");
    expect(html).toContain('role="status"');
    expect(html).toContain("No pages match “zzqxnothing”.");
    expect(html).toContain('href="/"');
  });

  it("keeps the query in the search box", async () => {
    const html = await renderSearch("vehicles");
    expect(html).toContain('value="vehicles"');
  });

  it("limits the search box and the query it accepts to 200 characters", async () => {
    const html = await renderSearch("a".repeat(300));
    expect(html.toLowerCase()).toContain('maxlength="200"');
    expect(html).toContain(`value="${"a".repeat(200)}"`);
    expect(html).not.toContain("a".repeat(201));
  });
});
