import type { Metadata } from "next";
import { CheckoutReturn } from "@/components/checkout-return";

// Where Stripe Checkout (test mode) sends the customer back. The address names
// only the booking id and the outcome; the manage token never travels through
// the payment page, so the browser tab that started the payment supplies it.
export const metadata: Metadata = {
  title: "Payment",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function CheckoutReturnPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const booking = typeof query.booking === "string" ? query.booking : "";
  return (
    <main className="mx-auto max-w-xl space-y-3 p-6" id="main-content">
      <CheckoutReturn bookingId={booking} paid={query.result === "paid"} />
    </main>
  );
}
