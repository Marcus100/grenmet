// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// The two apps are replaced by markers: this test is about which one mounts.
vi.mock("@/components/gate-app", () => ({
  GateApp: () => "gate scanner",
}));
vi.mock("@/organiser/organiser-app", () => ({
  OrganiserApp: () => "organiser screens",
}));

import { ScannerRoot } from "@/app-root";

afterEach(() => {
  cleanup();
});

describe("ScannerRoot", () => {
  it("renders the organiser screens at /organiser", () => {
    render(<ScannerRoot pathname="/organiser" />);
    expect(screen.getByText("organiser screens")).toBeInTheDocument();
    expect(screen.queryByText("gate scanner")).toBeNull();
  });

  it("keeps the gate scanner at /", () => {
    render(<ScannerRoot pathname="/" />);
    expect(screen.getByText("gate scanner")).toBeInTheDocument();
    expect(screen.queryByText("organiser screens")).toBeNull();
  });
});
