import { Logo } from "@grenmet/ui/components/ui/logo";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// `Logo` is a shared `@grenmet/ui` primitive; it is exercised here because
// admin-gms hosts the repo's only test harness. next/image is mocked to a plain
// <img> — under Vite, static PNG imports resolve to bare URL strings with no
// intrinsic dimensions, which the real next/image rejects.
vi.mock("next/image", () => ({
  default: ({
    src,
    alt,
    className,
  }: {
    src: string | { src: string };
    alt: string;
    className?: string;
  }) => (
    // biome-ignore lint/performance/noImgElement: deliberate lightweight mock of next/image for tests
    // biome-ignore lint/correctness/useImageSize: mocked next/image has no intrinsic dimensions
    <img
      alt={alt}
      className={className}
      src={typeof src === "string" ? src : src.src}
    />
  ),
}));

describe("Logo", () => {
  it("renders a single full-colour image for the icon variant", () => {
    render(<Logo variant="icon" />);
    const imgs = screen.getAllByRole("img");
    expect(imgs).toHaveLength(1);
    expect(imgs[0]).toHaveAttribute("alt", "Grenada Meteorological Service");
  });

  it("renders a light/dark pair with theme-toggle classes for lockups", () => {
    render(<Logo variant="primary" />);
    const imgs = screen.getAllByRole("img");
    expect(imgs).toHaveLength(2);
    // Light asset hides on dark surfaces; dark asset is hidden until dark.
    expect(imgs[0].className).toContain("dark:hidden");
    expect(imgs[1].className).toContain("hidden");
    expect(imgs[1].className).toContain("dark:block");
  });

  it("applies a custom alt and merges the caller's sizing className", () => {
    render(<Logo alt="GMS" className="size-7" variant="icon" />);
    const img = screen.getByRole("img");
    expect(img).toHaveAttribute("alt", "GMS");
    expect(img.className).toContain("size-7");
  });
});
