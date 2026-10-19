import type { Metadata } from "next";
import { PortfolioGallery } from "@/components/portfolio-gallery";
import { PageHead } from "@/components/sections";
import { SOCIALS } from "@/data/site";

export const metadata: Metadata = {
  title: "Portfolio",
  description:
    "Lash extensions, brow lamination and facials by Babydoll Beauty Bar in St. George's, Grenada.",
  alternates: { canonical: "/portfolio" },
};

export default function PortfolioPage() {
  const instagram = SOCIALS[0];
  return (
    <>
      <PageHead
        accent="real results"
        eyebrow="Portfolio"
        lede="Unfiltered photos of finished sets, brows and skin, taken in the studio."
        title="Real dolls,"
      />
      <section className="flush-top block">
        <div className="wrap">
          <PortfolioGallery />
          <div className="upload-note">
            <p>More of our latest work is on Instagram, updated every week.</p>
            <a
              className="btn btn-ghost"
              href={instagram.href}
              rel="noopener"
              target="_blank"
            >
              See more on Instagram
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
