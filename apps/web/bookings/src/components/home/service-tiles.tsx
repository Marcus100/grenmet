import type { BookingFeaturedService } from "@barrelsgd/api-client";
import { formatMoney } from "@barrelsgd/bookings-web/lib/booking-format";

/**
 * The first two featured services of a business as white tiles at the bottom
 * of its home page card: a dark price pill, the name (two lines at most) and
 * the minutes. Plain text inside the card's one link, so nothing here is
 * interactive and a screen reader reads each tile's price, name and minutes.
 * One service fills the width; none renders nothing.
 */
export function ServiceTiles({
  services,
}: Readonly<{ services: readonly BookingFeaturedService[] }>) {
  const shown = services.slice(0, 2);
  if (shown.length === 0) {
    return null;
  }
  return (
    <span
      className={`grid gap-2 ${shown.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}
    >
      {shown.map((service) => (
        <span
          className="bg-background text-foreground flex h-[150px] min-w-0 flex-col justify-between rounded-[26px] p-3"
          key={service.id}
        >
          <span className="bg-foreground text-background self-start rounded-full px-2.5 py-1 text-[12.5px] font-bold">
            {formatMoney(service.price_minor, service.currency)}
          </span>
          <span className="text-[15px] leading-tight font-semibold">
            <span className="line-clamp-2">{service.name}</span>
            <span className="text-muted-foreground block text-[13px] font-normal">
              {service.duration_min} min
            </span>
          </span>
        </span>
      ))}
    </span>
  );
}
