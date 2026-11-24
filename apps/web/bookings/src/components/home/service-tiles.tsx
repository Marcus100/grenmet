// The place for a business's two featured service tiles on its home page card.
// The API does not send featured services yet, so the card passes an empty list
// and this renders nothing. The prop shape is this app's own; when the API adds
// `featured_services`, map it to this shape at the call site in
// `business-listing.tsx` (nothing else changes).

export interface FeaturedService {
  currency: string;
  durationMinutes: number;
  id: string;
  name: string;
  /** Price in the currency's minor unit (cents). */
  priceMinor: number;
}

/** "EC$12" or "EC$12.50"; other currencies print their code first. */
export function formatPrice(priceMinor: number, currency: string): string {
  const major = priceMinor / 100;
  const amount = Number.isInteger(major) ? String(major) : major.toFixed(2);
  return `${currency === "XCD" ? "EC$" : `${currency} `}${amount}`;
}

/** At most two white tiles, each a dark price pill over the service name. */
export function ServiceTiles({
  services,
}: Readonly<{ services: readonly FeaturedService[] }>) {
  if (services.length === 0) {
    return null;
  }
  return (
    <span className="grid grid-cols-2 gap-2">
      {services.slice(0, 2).map((service) => (
        <span
          className="bg-background text-foreground flex h-[150px] flex-col justify-between rounded-[26px] p-3"
          key={service.id}
        >
          <span className="bg-foreground text-background self-start rounded-full px-2.5 py-1 text-[12.5px] font-bold">
            {formatPrice(service.priceMinor, service.currency)}
          </span>
          <span className="text-[15px] leading-tight font-semibold">
            {service.name}
            <span className="text-muted-foreground block text-[13px] font-normal">
              {service.durationMinutes} min
            </span>
          </span>
        </span>
      ))}
    </span>
  );
}
