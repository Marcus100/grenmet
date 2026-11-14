import { test } from "node:test";
import assert from "node:assert/strict";
import { parseManifest, runSteps } from "./guide-screenshots.mjs";

test("accepts a minimal screen and fills defaults", () => {
  const [screen] = parseManifest({
    screens: [{ id: "roster-week", app: "gaa-admin", path: "/hr/roster" }],
  });
  assert.deepEqual(screen, {
    id: "roster-week",
    app: "gaa-admin",
    path: "/hr/roster",
    width: 1280,
    theme: "light",
    steps: [],
  });
});

test("rejects duplicate ids, relative paths and bad steps", () => {
  assert.throws(
    () =>
      parseManifest({
        screens: [
          { id: "a", app: "docs", path: "/" },
          { id: "a", app: "docs", path: "/" },
        ],
      }),
    /Duplicate id 'a'/u
  );
  assert.throws(
    () => parseManifest({ screens: [{ id: "b", app: "docs", path: "guide" }] }),
    /must start with/u
  );
  assert.throws(
    () =>
      parseManifest({
        screens: [{ id: "c", app: "docs", path: "/", steps: [{ click: "x", press: "Enter" }] }],
      }),
    /exactly one of/u
  );
});

test("runs steps in order against the page", async () => {
  const calls = [];
  const page = {
    getByText: (text) => ({
      first: () => ({
        click: async () => calls.push(`click:${text}`),
        waitFor: async () => calls.push(`wait:${text}`),
      }),
    }),
    keyboard: { press: async (key) => calls.push(`press:${key}`) },
    waitForLoadState: async () => calls.push("idle"),
  };
  await runSteps(page, [{ click: "Week" }, { press: "Escape" }, { waitForText: "Done" }]);
  assert.deepEqual(calls, ["click:Week", "idle", "press:Escape", "idle", "wait:Done", "idle"]);
});
