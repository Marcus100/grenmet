import type { SearchOptions } from "flexsearch";

declare module "*.svg" {
  const content: string;
  export default content;
}

declare module "@/mdx/search.mjs" {
  export interface Result {
    pageTitle?: string;
    title: string;
    url: string;
  }

  export function search(query: string, options?: SearchOptions): Result[];
}
