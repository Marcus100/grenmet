// Relative import of the generated collection (not the tsconfig path alias):
// the alias reads as an undeclared package to Biome.

import { publishedPosts } from "@/lib/posts";
import { allPosts } from "../../.content-collections/generated";

export type Post = (typeof allPosts)[number];

export function getPosts(): Post[] {
  return publishedPosts(allPosts);
}
