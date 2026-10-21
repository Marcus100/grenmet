"use client";

import { type KeyboardEvent, useState } from "react";
import { formatPrice, SERVICE_MENU, type ServiceCategory } from "@/data/site";
import type { CtaLink } from "@/lib/book-link";

/** Tabbed price list. Every panel is in the HTML; inactive ones are hidden. */
export function ServiceMenu({ booking }: { booking: CtaLink }) {
  const [active, setActive] = useState<ServiceCategory["id"]>("lashes");
  const ids = SERVICE_MENU.map((category) => category.id);

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    const step = event.key === "ArrowRight" ? 1 : -1;
    const next = ids[(ids.indexOf(active) + step + ids.length) % ids.length];
    if (!next) return;
    setActive(next);
    document.getElementById(`tab-${next}`)?.focus();
  };

  return (
    <>
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
