import { Button } from "@barrelsgd/ui/components/ui/button";
import { Input } from "@barrelsgd/ui/components/ui/input";
import { cn } from "@barrelsgd/ui/lib/utils";

export function SubscribeBand({
  id,
  className,
}: {
  id?: string;
  className?: string;
}) {
  return (
    <section className={cn("bg-signal-green text-white", className)} id={id}>
      <div className="mx-auto w-full max-w-2xl px-4 py-10">
        <h2 className="font-bold font-serif text-2xl sm:text-3xl">
          Know what going on. In 5 minutes.
        </h2>
        <p className="mt-2 text-sm">
          Demo preview. Subscriptions are not open yet. No contact details are
          collected or saved.
        </p>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <Input
            aria-label="Email address"
            className="flex-1 bg-white text-signal-ink"
            disabled
            placeholder="Email address"
            type="email"
          />
          <Button className="bg-signal-ink text-white" disabled>
            Subscribe
          </Button>
        </div>
      </div>
    </section>
  );
}
