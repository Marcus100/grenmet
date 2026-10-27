"use client";

export default function BusinessError({ reset }: { reset: () => void }) {
  return (
    <section className="space-y-4">
      <h1 className="font-semibold text-2xl">
        Online booking is taking a break
      </h1>
      <p className="text-muted-foreground">
        We couldn't load this booking page. Try again in a moment, or contact
        the business directly.
      </p>
      <button className="btn btn-solid" onClick={reset} type="button">
        Try again
      </button>
    </section>
  );
}
