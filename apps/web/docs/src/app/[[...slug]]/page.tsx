import { JsonLd } from "@barrelsgd/ui/components/json-ld";
import { websiteJsonLd } from "@barrelsgd/ui/lib/seo";
import { allHurricanepages } from "content-collections";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { MdxContent } from "@/components/MdxContent";
import { env } from "@/lib/env";
import { pagePath } from "@/lib/sitemap";

interface PageProps {
  params: Promise<{ slug?: string[] }>;
}

function resolvePath(slug?: string[]) {
  return slug ? slug.join("/") : "index";
}

function findPage(path: string) {
  return allHurricanepages.find(
    (p) => p._meta.path.replaceAll("\\", "/") === path
  );
}

/**
 * Only the content pages exist. Any other path is answered by Next's router
 * with the not-found page rendered on the server (status 404). Rendering an
 * unknown path on demand would make the page call notFound() mid-render, and
 * Next 16 then sends an empty error document that only fills in with
 * JavaScript.
 */
export const dynamicParams = false;

export function generateStaticParams() {
  return allHurricanepages.map((page) => ({
    slug: page._meta.path === "index" ? undefined : page._meta.path.split("/"),
  }));
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const page = findPage(resolvePath(slug));
  if (!page) return {};
  const path = pagePath(resolvePath(slug));
  return {
    title: page.title,
    description: page.description,
    alternates: { canonical: path },
    openGraph: { title: page.title, description: page.description, url: path },
  };
}

export default async function Page({ params }: PageProps) {
  const { slug } = await params;
  const page = findPage(resolvePath(slug));
  if (!page) notFound();
  if (resolvePath(slug) !== "index") {
    return <MdxContent code={page.body} />;
  }
  return (
    <>
      <JsonLd
        data={websiteJsonLd({
          name: "GMS Documentation",
          siteUrl: env.NEXT_PUBLIC_SITE_URL,
          description:
            "Documentation for the Grenada Meteorological Service systems.",
        })}
      />
      <MdxContent code={page.body} />
    </>
  );
}
