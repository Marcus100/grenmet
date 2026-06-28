import { allArticles, allBriefs } from "content-collections";
import {
  bySection,
  findArticle,
  publishedArticles,
  sortBriefsDesc,
} from "./content-utils";

export type Article = (typeof allArticles)[number];
export type Brief = (typeof allBriefs)[number];

export function getPublishedArticles(): Article[] {
  return publishedArticles(allArticles);
}

export function getArticlesBySection(section: string): Article[] {
  return bySection(allArticles, section);
}

export function getArticle(section: string, slug: string): Article | undefined {
  return findArticle(allArticles, section, slug);
}

export function getBriefs(): Brief[] {
  return sortBriefsDesc(allBriefs);
}

export function getLatestBrief(): Brief | undefined {
  return getBriefs()[0];
}

export function getBrief(date: string): Brief | undefined {
  return allBriefs.find((brief) => brief.date === date);
}
