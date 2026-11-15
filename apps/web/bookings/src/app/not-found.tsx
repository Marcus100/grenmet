import { buttonVariants } from "@barrelsgd/ui/components/ui/button";
import Link from "next/link";

export default function NotFound() {
  return (
    // The root layout has no <main>, so this page supplies the landmark the
    // skip link points at.
    <main className="mx-auto max-w-xl space-y-3 p-6" id="main-content">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="text-muted-foreground">
        There is no page or online booking at this address. Check the link you
        were given, or contact the business directly.
      </p>
      <Link className={buttonVariants()} href="/">
        Back to the home page
      </Link>
    </main>
  );
}
