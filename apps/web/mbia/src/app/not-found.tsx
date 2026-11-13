import { Button } from "@barrelsgd/ui/components/ui/button";
import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center px-4 py-28 text-center">
      <p className="text-gaa-gold text-xs font-semibold tracking-[0.25em] uppercase">
        404 — Gate not found
      </p>
      <h1 className="font-display text-gaa-navy mt-4 text-4xl font-bold">
        This page seems to have departed
      </h1>
      <p className="text-gaa-muted mt-4 max-w-md">
        The page you&rsquo;re looking for doesn&rsquo;t exist or has moved.
        Check the departures board or head back to the terminal.
      </p>
      <div className="mt-8 flex gap-3">
        <Button
          asChild
          className="bg-gaa-navy hover:bg-gaa-navy-deep text-white"
        >
          <Link href="/">Back to home</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/flights">Flight information</Link>
        </Button>
      </div>
    </div>
  );
}
