/**
 * A plain GET form to `/search?q=`, so it works without JavaScript. Server
 * rendered; used on the 404 page and the search page.
 */
export function DocsSearchForm({
  defaultValue,
  id = "docs-search",
}: {
  defaultValue?: string;
  id?: string;
}) {
  return (
    <search className="mx-auto w-full max-w-md">
      <form
        action="/search"
        className="flex flex-col gap-2 sm:flex-row"
        method="get"
      >
        <label className="sr-only" htmlFor={id}>
          Search the documentation
        </label>
        <input
          autoComplete="off"
          className="min-h-11 flex-auto rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-500 focus-visible:outline-2 focus-visible:outline-offset-2 dark:bg-zinc-900 dark:text-white"
          defaultValue={defaultValue}
          id={id}
          name="q"
          placeholder="Find a page, for example hurricane"
          type="search"
        />
        <button
          className="min-h-11 rounded-md bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700 focus-visible:outline-2 focus-visible:outline-offset-2 dark:bg-white dark:text-zinc-900"
          type="submit"
        >
          Search
        </button>
      </form>
    </search>
  );
}
