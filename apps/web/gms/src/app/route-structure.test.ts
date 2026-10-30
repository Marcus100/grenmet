// @vitest-environment node
//
// The 404 mechanism depends on folder structure: a loading file in any folder
// above a route streams its response before notFound() runs, so the status
// would be 200. The routes that must answer 404 are checked here, on disk.
import { readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { APP_DIR } from "@/test/routes";

const PAGE_FILE = /^page\.(tsx|ts|jsx|js)$/;
const LOADING = /^loading\.(tsx|ts|jsx|js)$/;
const NOT_FOUND_ROUTE_GROUPS = ["(articles)", "(planned)"];

/** Every folder under `dir` that holds a page, recursively. */
function pageFolders(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (!entry.isDirectory()) {
      return [];
    }
    const child = path.join(dir, entry.name);
    const here = readdirSync(child).some((file) => PAGE_FILE.test(file))
      ? [child]
      : [];
    return [...here, ...pageFolders(child)];
  });
}

/** The folder of a route and every folder above it, up to the app folder. */
function foldersAbove(folder: string): string[] {
  const folders: string[] = [];
  let current = folder;
  for (;;) {
    folders.push(current);
    if (current === APP_DIR) {
      return folders;
    }
    current = path.dirname(current);
  }
}

const routes = NOT_FOUND_ROUTE_GROUPS.flatMap((group) =>
  pageFolders(path.join(APP_DIR, group))
);

describe("routes that must answer 404 for a missing item", () => {
  it("are found on disk", () => {
    expect(routes.length).toBeGreaterThan(0);
  });

  it.each(routes.map((folder) => [path.relative(APP_DIR, folder), folder]))(
    "%s has no loading file in its folder or any folder above it",
    (_name, folder) => {
      for (const above of foldersAbove(folder)) {
        const loading = readdirSync(above).filter((file) => LOADING.test(file));
        expect(
          loading,
          `loading file in ${path.relative(APP_DIR, above) || "app"}`
        ).toEqual([]);
      }
    }
  );
});
