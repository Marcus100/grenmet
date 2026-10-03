import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Photo } from "@/components/photo";
import { CONSTITUENCY_PHOTOS, PHOTOS } from "@/data/photos";
import constituencies from "@/data/source/reference/constituencies.json";

const CREDITS = "public/images/CREDITS.md";
const PUBLIC_DOMAIN = /Public domain/;

describe("photos", () => {
  it("credit every photo with its creator, source and licence", () => {
    render(<Photo id="grandetang" />);
    expect(
      screen.getByRole("img", { name: PHOTOS.grandetang.alt })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Jerzy Bereszko" })
    ).toHaveAttribute("href", PHOTOS.grandetang.source);
    expect(screen.getByRole("link", { name: "CC BY-SA 4.0" })).toHaveAttribute(
      "href",
      "https://creativecommons.org/licenses/by-sa/4.0/"
    );
  });

  it("names public-domain photos without a licence link", () => {
    render(<Photo id="carenage1906" />);
    expect(screen.getByText(PUBLIC_DOMAIN)).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Public domain" })
    ).not.toBeInTheDocument();
  });

  it("ships every file and lists it in the credits", () => {
    const credits = readFileSync(CREDITS, "utf8");
    for (const photo of Object.values(PHOTOS)) {
      expect(existsSync(join("public", photo.src))).toBe(true);
      expect(credits).toContain(photo.src.replace("/images/", ""));
    }
  });

  it("only places constituency photos on real constituencies", () => {
    for (const code of Object.keys(CONSTITUENCY_PHOTOS))
      expect(Object.keys(constituencies)).toContain(code);
  });
});
