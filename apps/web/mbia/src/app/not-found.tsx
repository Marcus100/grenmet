import { Button } from "@grenmet/ui/components/ui/button";
import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center px-4 py-28 text-center">
      <p className="font-semibold text-gaa-gold text-xs uppercase tracking-[0.25em]">
        404 — Gate not found
      </p>
      <h1 className="mt-4 font-bold font-display text-4xl text-gaa-navy">
        This page seems to have departed
      </h1>
      <p className="mt-4 max-w-md text-gaa-muted">
        The page you&rsquo;re looking for doesn&rsquo;t exist or has moved.
        Check the departures board or head back to the terminal.
      </p>
      <div className="mt-8 flex gap-3">
        <Button
          asChild
          className="bg-gaa-navy text-white hover:bg-gaa-navy-deep"
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
