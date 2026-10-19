import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { qrMatrix } from "@/lib/qr";
import { QrCode } from "./qr-code";

const TOKEN = "BT1.7K3M9Q2XVD.AbCdEfGhIjKlMnOp";

describe("qrMatrix", () => {
  it("draws a square symbol with dark modules for the token", () => {
    const { path, size } = qrMatrix(TOKEN);
    expect(size).toBeGreaterThanOrEqual(21);
    expect(path.startsWith("M")).toBe(true);
    expect(qrMatrix(TOKEN)).toEqual({ path, size });
    expect(qrMatrix("BT1.OTHER.CODE").path).not.toBe(path);
  });
});

describe("QrCode", () => {
  it("renders an accessible SVG with a quiet zone", () => {
    const { container, getByRole } = render(
      <QrCode label="QR code for Free Night" value={TOKEN} />
    );
    expect(getByRole("img", { name: "QR code for Free Night" })).toBeTruthy();
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("viewBox")?.startsWith("-2 -2")).toBe(true);
    expect(container.querySelector("path")?.getAttribute("d")).toBe(
      qrMatrix(TOKEN).path
    );
  });
});
