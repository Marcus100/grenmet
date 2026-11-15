"use client";

import { type KeyboardEvent, useState } from "react";
import { formatPrice, SERVICE_MENU, type ServiceCategory } from "@/data/site";
import type { CtaLink } from "@/lib/book-link";

/** Tabbed price list. Every panel is in the HTML; inactive ones are hidden. */
export function ServiceMenu({ booking }: { booking: CtaLink }) {
  const [active, setActive] = useState<ServiceCategory["id"]>("lashes");
  const ids = SERVICE_MENU.map((category) => category.id);

  // Tabs pattern: arrows step through, Home and End jump to the ends.
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    // Alt, Ctrl and Cmd combinations belong to the browser (Alt+Left, Ctrl+Home).
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    let next: ServiceCategory["id"] | undefined;
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      const step = event.key === "ArrowRight" ? 1 : -1;
      next = ids[(ids.indexOf(active) + step + ids.length) % ids.length];
    } else if (event.key === "Home") {
      next = ids[0];
    } else if (event.key === "End") {
      next = ids.at(-1);
    }
    if (!next) return;
    event.preventDefault();
    setActive(next);
    document.getElementById(`tab-${next}`)?.focus();
  };

  return (
    <>
      {/* One note for the whole menu: every Book link below opens a new tab. */}
      <p className="sr-only">Book links open the booking page in a new tab.</p>
      <div aria-label="Service categories" className="chips" role="tablist">
        {SERVICE_MENU.map((category) => (
          <button
            aria-controls={`panel-${category.id}`}
            aria-selected={active === category.id}
            id={`tab-${category.id}`}
            key={category.id}
            onClick={() => setActive(category.id)}
            onKeyDown={onKeyDown}
            role="tab"
            tabIndex={active === category.id ? 0 : -1}
            type="button"
          >
            {category.label}
          </button>
        ))}
      </div>
      {SERVICE_MENU.map((category) => (
        <div
          aria-labelledby={`tab-${category.id}`}
          className="menu-cols"
          hidden={active !== category.id}
          id={`panel-${category.id}`}
          key={category.id}
          role="tabpanel"
        >
          {category.groups.map((group) => (
            <div key={group.title}>
              <h2 className="cat-title">{group.title}</h2>
              {group.services.map((service) => (
                <div className="item" key={service.name}>
                  <div className="item-row">
                    <h3>{service.name}</h3>
                    <span aria-hidden="true" className="dots" />
                    <span className="p">{formatPrice(service.price)}</span>
                  </div>
                  {service.description && <p>{service.description}</p>}
                  {service.note && <span className="note">{service.note}</span>}
                  {!service.addOn && (
                    <a
                      aria-label={`Book ${service.name}`}
                      className="book-link"
                      href={booking.href}
                      rel={booking.rel}
                      target={booking.target}
                    >
                      Book <span aria-hidden="true">→</span>
                    </a>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      ))}
    </>
  );
}
