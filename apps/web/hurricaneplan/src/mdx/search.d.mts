export interface Result {
  url: string;
  title: string;
  pageTitle?: string;
  [key: string]: unknown;
}

export declare function search(
  query: string,
  options?: { limit?: number }
): Result[];
