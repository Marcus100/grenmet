export interface Result {
  pageTitle?: string;
  title: string;
  url: string;
  [key: string]: unknown;
}

export declare function search(
  query: string,
  options?: { limit?: number }
): Result[];
