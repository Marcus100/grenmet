import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { expect, it } from "vitest";

const { JSDOM } = createRequire(import.meta.url)("jsdom") as {
  JSDOM: new (
    html: string,
    options: { url: string; runScripts: "outside-only" }
  ) => {
    window: Window & { eval: (source: string) => unknown };
  };
};

const directory = resolve(process.cwd(), "../barrels");
execFileSync(process.execPath, [resolve(directory, "build.mjs")]);
const read = (file: string) =>
  readFileSync(resolve(directory, "dist", file), "utf8");

it("static Barrels uses the shared consent and Google protocol with no preview collection", () => {
  const policy = read("analytics-policy.js");
  // Keep the fixture usable for destinations that have not yet been configured.
  const configured = policy
    .replaceAll('"ga4": null', '"ga4": "G-TEST123"')
    .replaceAll('"ga4":null', '"ga4":"G-TEST123"')
    .replaceAll('"status":"unconfigured"', '"status":"configured"')
    .replaceAll('"retentionVerified":false', '"retentionVerified":true')
    .replaceAll('"accessVerified":false', '"accessVerified":true');
  const transport = read("google-analytics.js");
  const entry = read("analytics.mjs").replace(
    /^import[\s\S]*?from ["'][^"']+["'];/gm,
    ""
  );
  for (const origin of ["https://barrels.gd", "https://preview.vercel.app"]) {
    const dom = new JSDOM(read("index.html"), {
      url: origin,
      runScripts: "outside-only",
    });
    try {
      dom.window.eval(
        [configured, transport, entry].join("\n").replace(/\bexport /g, "")
      );
      const document = dom.window.document;
      expect(document.getElementById("optional-google-analytics")).toBeNull();
      document.getElementById("analytics-accept")?.click();
      if (origin !== "https://barrels.gd") {
        expect(document.getElementById("optional-google-analytics")).toBeNull();
        continue;
      }
      expect(
        document.getElementById("optional-google-analytics")
      ).not.toBeNull();
      const layer = (dom.window as unknown as { dataLayer: IArguments[] })
        .dataLayer;
      expect(
        layer.some(
          (command) => command[0] === "event" && command[1] === "page_view"
        )
      ).toBe(true);
      document.getElementById("analytics-decline")?.click();
      expect(document.getElementById("optional-google-analytics")).toBeNull();
      expect(layer).toHaveLength(0);
    } finally {
      dom.window.close();
    }
  }
}, 15_000);
