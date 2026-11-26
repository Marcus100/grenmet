import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ReturningClientNotice, ReturningClientTag } from "./returning-client";

const FLAG = /returning_client|returningClient|Returning client/u;
const SOURCE_FILE = /\.(ts|tsx)$/u;
const TEST_FILE = /\.test\.(ts|tsx)$/u;
const STUDIO_PATH = /[\\/]studio[\\/]|[\\/]studio-[^\\/]*$/u;
const BOOKED_BEFORE =
  /They've booked with you before\. This service is for new clients\./u;

/** Every source file under a folder, skipping tests and generated output. */
function sourceFiles(root: string): string[] {
  return readdirSync(root).flatMap((name) => {
    const path = resolve(root, name);
    if (statSync(path).isDirectory()) {
      return name === "node_modules" || name === ".next"
        ? []
        : sourceFiles(path);
    }
    return SOURCE_FILE.test(name) && !TEST_FILE.test(name) ? [path] : [];
  });
}

describe("returning client flag", () => {
  it("is an outlined tag with its words", () => {
    render(<ReturningClientTag />);
    expect(screen.getByText("Returning client")).toBeVisible();
  });

  it("is a notice with the plain words, not an accusation", () => {
    render(<ReturningClientNotice />);
    expect(
      screen.getByRole("heading", { name: "Returning client" })
    ).toBeVisible();
    expect(screen.getByText(BOOKED_BEFORE)).toBeVisible();
  });

  it("never appears in a public page, component or the shared booking package", () => {
    // Vitest runs in the bookings package folder. Everything under src except the
    // studio (app/studio, components/studio, lib/studio-*) is public surface, as
    // is the shared bookings package.
    const app = resolve(process.cwd(), "src");
    const publicRoots = [
      app,
      resolve(process.cwd(), "../../../packages/bookings-web/src"),
    ];
    const offenders = publicRoots
      .flatMap((root) => sourceFiles(root))
      .filter((path) => !STUDIO_PATH.test(path))
      .filter((path) => FLAG.test(readFileSync(path, "utf8")));
    expect(offenders).toEqual([]);
  });
});
