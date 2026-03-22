import type { SearchOptions } from "flexsearch";

declare module "@/mdx/search.mjs" {
  export interface Result {
    pageTitle?: string;
    title: string;
    url: string;
  }

  export function search(query: string, options?: SearchOptions): Result[];
}
