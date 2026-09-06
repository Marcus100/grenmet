import { allHurricanepages } from "content-collections";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { MdxContent } from "@/components/MdxContent";

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
  return { title: page.title, description: page.description };
}

export default async function Page({ params }: PageProps) {
  const { slug } = await params;
  const page = findPage(resolvePath(slug));
  if (!page) notFound();
  return <MdxContent code={page.body} />;
}
