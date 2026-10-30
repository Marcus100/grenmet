import Link from "next/link";

export default function BusinessNotFound() {
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Booking page not found</h1>
      <p className="text-muted-foreground">
        There is no online booking at this address. Check the link you were
        given, or contact the business directly.
      </p>
      <Link className="btn btn-solid" href="/">
        About Barrels Bookings
      </Link>
    </section>
  );
}
