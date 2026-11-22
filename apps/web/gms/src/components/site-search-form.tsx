import { Button } from "@barrelsgd/ui/components/ui/button";
import { Input } from "@barrelsgd/ui/components/ui/input";
import { Label } from "@barrelsgd/ui/components/ui/label";

/**
 * A plain GET form to `/search?q=`, so it works without JavaScript. Used where
 * a visitor may land without a menu in reach (the 404 page, the search page).
 */
export function SiteSearchForm({
  defaultValue,
  id = "site-search",
}: {
  defaultValue?: string;
  id?: string;
}) {
  return (
    <search>
      <form
        action="/search"
        className="flex flex-col gap-2 sm:flex-row sm:items-end"
        method="get"
      >
        <div className="grid flex-1 gap-1.5">
          <Label htmlFor={id}>Search the site</Label>
          <Input
            autoComplete="off"
            defaultValue={defaultValue}
            id={id}
            name="q"
            placeholder="Forecasts, places, topics"
            type="search"
          />
        </div>
        <Button type="submit">Search</Button>
      </form>
    </search>
  );
}
