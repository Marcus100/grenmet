import { buttonVariants } from "@barrelsgd/ui/components/ui/button";
import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl space-y-3 p-6">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="text-muted-foreground">
        This page does not exist or has moved.
      </p>
      <Link className={buttonVariants()} href="/">
        Back to the home page
      </Link>
    </div>
  );
}
