import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isBusinessSlug } from "@/lib/slug";

export const metadata: Metadata = {
  title: "Book an appointment",
};

interface BusinessPageProps {
  params: Promise<{ slug: string }>;
}

/**
 * Placeholder for a business's public booking page. The business name and the
 * booking flow come from the Bookings API in a later release; until then this
 * says that online booking is not open yet.
 */
export default async function BusinessBookingPage({
  params,
}: BusinessPageProps) {
  const { slug } = await params;
  if (!isBusinessSlug(slug)) notFound();

  return (
    <main
      className="mx-auto flex min-h-screen max-w-2xl flex-col gap-4 p-6"
      id="main-content"
    >
      <h1 className="font-semibold text-2xl">Online booking</h1>
      <p className="text-muted-foreground">
        Online booking is not open for this business yet.
      </p>
    </main>
  );
}
