import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const gate = vi.hoisted(() => ({ requireDeskGate: vi.fn() }));
vi.mock("@/lib/desk/gate", () => gate);
vi.mock("@/components/desk/import-form", () => ({
  ImportForm: () => <div>import-form-stub</div>,
}));

import ImportWarningPage from "./page";

describe("import page", () => {
  beforeEach(() => {
    gate.requireDeskGate.mockReset();
  });

  it("shows no access and no form to an account without create permission", async () => {
    gate.requireDeskGate.mockResolvedValue({
      email: "viewer@example.org",
      permissions: { create: false, read: true },
      status: "staff",
    });
    render(await ImportWarningPage());
    expect(screen.getByText("No access to CAP warnings")).toBeInTheDocument();
    expect(screen.queryByText("import-form-stub")).not.toBeInTheDocument();
  });

  it("shows no access to a refused account", async () => {
    gate.requireDeskGate.mockResolvedValue({
      email: "x@example.org",
      status: "refused",
    });
    render(await ImportWarningPage());
    expect(screen.getByText("No access to CAP warnings")).toBeInTheDocument();
  });

  it("renders the heading and form for an account that may create", async () => {
    gate.requireDeskGate.mockResolvedValue({
      email: "forecaster@example.org",
      permissions: { create: true, read: true },
      status: "staff",
    });
    render(await ImportWarningPage());
    expect(
      screen.getByRole("heading", { name: "Import a warning" })
    ).toBeInTheDocument();
    expect(screen.getByText("import-form-stub")).toBeInTheDocument();
  });
});
