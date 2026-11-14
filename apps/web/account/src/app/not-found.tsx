import { buttonVariants } from "@barrelsgd/ui/components/ui/button";
import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl space-y-3 p-6" id="main-content">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="text-muted-foreground">
        There is no page at this address. Check the link you followed.
      </p>
      <Link className={buttonVariants()} href="/">
        Back to your account
      </Link>
    </div>
  );
}
