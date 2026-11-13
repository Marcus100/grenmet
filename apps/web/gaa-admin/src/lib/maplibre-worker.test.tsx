import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CapMap } from "@/components/cap/cap-map";
import { MAPLIBRE_WORKER_FILE, MAPLIBRE_WORKER_URL } from "./maplibre-worker";

// Regression: MapLibre 6 derived an empty worker address inside the Next.js
// bundle, so the worker never started and no parish was drawn.

const mapProps = vi.hoisted(() => ({ last: {} as Record<string, unknown> }));

vi.mock("react-map-gl/maplibre", () => ({
  AttributionControl: () => null,
  Layer: () => null,
  Map: (props: Record<string, unknown> & { children?: React.ReactNode }) => {
    mapProps.last = props;
    return <div data-testid="cap-map">{props.children}</div>;
  },
  NavigationControl: () => null,
  ScaleControl: () => null,
  Source: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

interface CopyScript {
  copyMapLibreWorker: (appDir: string, publicDir?: string) => string;
}

const SAME_ORIGIN_VERSIONED = /^\/maplibre-gl-worker\.mjs\?v=\d+\.\d+\.\d+/u;

const appDir = resolve(import.meta.dirname, "../..");
let scratch: string | undefined;

afterEach(() => {
  if (scratch) {
    rmSync(scratch, { force: true, recursive: true });
    scratch = undefined;
  }
});

describe("MapLibre worker", () => {
  it("is a same-origin address carrying the installed MapLibre version", () => {
    const { version } = createRequire(join(appDir, "package.json"))(
      "maplibre-gl/package.json"
    ) as { version: string };
    expect(MAPLIBRE_WORKER_URL).toMatch(SAME_ORIGIN_VERSIONED);
    expect(MAPLIBRE_WORKER_URL).toBe(`/${MAPLIBRE_WORKER_FILE}?v=${version}`);
  });

  it("is passed to the map before it is created", () => {
    render(<CapMap />);
    expect(mapProps.last.workerUrl).toBe(MAPLIBRE_WORKER_URL);
  });

  it("is copied byte for byte to the path the map asks for", async () => {
    const scriptPath = join(appDir, "scripts/copy-maplibre-worker.mjs");
    const { copyMapLibreWorker } = (await import(
      /* @vite-ignore */ scriptPath
    )) as CopyScript;
    scratch = mkdtempSync(join(tmpdir(), "maplibre-worker-"));

    const copied = copyMapLibreWorker(appDir, scratch);

    expect(basename(copied)).toBe(MAPLIBRE_WORKER_FILE);
    const original = createRequire(join(appDir, "package.json")).resolve(
      "maplibre-gl/dist/maplibre-gl-worker.mjs"
    );
    expect(readFileSync(copied).equals(readFileSync(original))).toBe(true);
  });
});
