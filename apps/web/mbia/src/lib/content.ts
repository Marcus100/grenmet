import { allPages } from "content-collections";
import { findPage, newsByDate, pagesInSection } from "@/lib/content-utils";
import type { Section } from "@/lib/nav";

export function getSectionPages(section: Section) {
  return pagesInSection(allPages, section);
}

export function getNews() {
  return newsByDate(allPages);
}

export function getPage(section: Section, slug: string) {
  return findPage(allPages, section, slug);
}
