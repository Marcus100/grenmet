import { buttonVariants } from "@barrelsgd/ui/components/ui/button";
import Link from "next/link";

// Renders inside the root layout, so the site navigation stays usable.
export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl space-y-3 p-6">
      <h1 className="font-semibold text-2xl">Page not found</h1>
      <p className="text-muted-foreground text-sm">
        This page does not exist or has moved.
      </p>
      <Link className={buttonVariants()} href="/">
        Go to sign in
      </Link>
    </div>
  );
}
