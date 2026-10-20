import Link from "next/link";

export default function HomePage() {
  return (
    <main
      className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-4 p-6"
      id="main-content"
    >
      <p className="font-medium text-muted-foreground text-sm">
        Barrels Bookings
      </p>
      <h1 className="font-semibold text-3xl tracking-tight">
        Online appointments for Grenada businesses
      </h1>
      <p className="text-muted-foreground">
        Each business has its own booking page. Businesses manage their
        services, hours and appointments in the studio, after signing in with a
        Barrels account.
      </p>
      <p>
        <Link className="underline underline-offset-4" href="/studio">
          Open the studio
        </Link>
      </p>
    </main>
  );
}
