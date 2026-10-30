import assert from "node:assert/strict";
import test from "node:test";
import { developmentOrigin, parseArgs, planShots } from "./ui-screenshots.mjs";

const NEEDS_TARGET = /--app <id> or --url <origin>/u;
const BAD_WIDTH = /pixel widths/u;
const BAD_THEME = /light and\/or dark/u;
const UNKNOWN_FLAG = /Unknown argument/u;
const KNOWN_APPS = /Known apps: gms/u;

const catalogue = {
  services: [
    {
      id: "gms",
      environments: { development: { origin: "http://localhost:3003" } },
    },
    { id: "worker", environments: { development: { origin: null } } },
  ],
};

test("defaults to the home page at phone and desktop width in both themes", () => {
  const options = parseArgs(["--app", "gms"]);
  assert.deepEqual(options.paths, ["/"]);
  assert.deepEqual(options.widths, [375, 1280]);
  assert.deepEqual(options.themes, ["light", "dark"]);
});

test("rejects missing targets, bad widths and unknown themes with a fix", () => {
  assert.throws(() => parseArgs([]), NEEDS_TARGET);
  assert.throws(
    () => parseArgs(["--app", "gms", "--widths", "abc"]),
    BAD_WIDTH
  );
  assert.throws(
    () => parseArgs(["--app", "gms", "--themes", "sepia"]),
    BAD_THEME
  );
  assert.throws(() => parseArgs(["--app", "gms", "--zoom", "2"]), UNKNOWN_FLAG);
});

test("resolves an app's development origin from the service catalogue", () => {
  assert.equal(developmentOrigin(catalogue, "gms"), "http://localhost:3003");
  assert.throws(() => developmentOrigin(catalogue, "worker"), KNOWN_APPS);
});

test("plans one shot per page, width and theme with stable file names", () => {
  const shots = planShots({
    origin: "http://localhost:3003",
    paths: ["/", "/forecast/marine"],
    widths: [375],
    themes: ["light", "dark"],
  });
  assert.deepEqual(
    shots.map((shot) => [shot.file, shot.url]),
    [
      ["home-375-light.png", "http://localhost:3003/"],
      ["home-375-dark.png", "http://localhost:3003/"],
      [
        "forecast-marine-375-light.png",
        "http://localhost:3003/forecast/marine",
      ],
      ["forecast-marine-375-dark.png", "http://localhost:3003/forecast/marine"],
    ]
  );
});
