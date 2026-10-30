import { buttonVariants } from "@barrelsgd/ui/components/ui/button";
import Link from "next/link";

// Renders inside the root layout, so the site navigation stays usable.
export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl space-y-3 px-4 py-10">
      <h1 className="font-gm-display text-gm-display text-gm-heading font-bold tracking-wide uppercase">
        Page not found
      </h1>
      <p className="text-body-base text-gm-text-secondary leading-body-base">
        This page does not exist or has moved. Current forecasts and warnings
        are always on the home page.
      </p>
      <Link className={buttonVariants()} href="/">
        Go to the forecast
      </Link>
    </div>
  );
}
