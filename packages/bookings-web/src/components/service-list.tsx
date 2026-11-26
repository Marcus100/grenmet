"use client";

import type {
  BookingPublicService,
  BookingStorefront,
} from "@barrelsgd/api-client";
import { useId, useState } from "react";
import { businessDepositLabel, businessDepositOf } from "../lib/booking-extras";
import { formatDuration, formatMoney } from "../lib/booking-format";
import { dueAtBooking } from "../lib/booking-payment";
import {
  defaultOpenCategory,
  groupServicesByCategory,
  serviceCountLabel,
} from "../lib/service-categories";
import { ServiceDetails } from "./service-details";

export interface ServiceListProps {
  /** Add-ons are ticked, so the chosen service's details leave out the amount. */
  addOnsChosen?: boolean;
  /** Services shown as "Book again" shortcuts; the first one's category opens by default. */
  bookAgainIds: string[];
  /** Chooses a service (the flow clears the time and loads the new times). */
  onPick: (serviceId: string) => void;
  selectedId: string | null;
  services: BookingPublicService[];
  /** The business's page: currency, deposits, policy and add-ons for the details. */
  storefront: BookingStorefront;
}

function ServiceOption({
  addOnsChosen,
  item,
  onPick,
  selectedId,
  storefront,
}: {
  addOnsChosen: boolean;
  item: BookingPublicService;
  onPick: (serviceId: string) => void;
  selectedId: string | null;
  storefront: BookingStorefront;
}) {
  const detailsId = useId();
  const chosen = item.id === selectedId;
  const currency = storefront.currency;
  const toBusiness =
    storefront.deposit_collection === "business" ? businessDepositOf(item) : 0;
  const due = dueAtBooking(item);
  return (
    <div className="service-option" data-chosen={chosen ? "true" : undefined}>
      <label className="service-row">
        <input
          aria-describedby={chosen ? detailsId : undefined}
          checked={chosen}
          name="service"
          onChange={() => onPick(item.id)}
          type="radio"
          value={item.id}
        />
        <span className="service-text">
          <span className="service-name">
            {item.name}
            {item.new_clients_only ? (
              <>
                {" "}
                <span className="service-badge">New clients</span>
              </>
            ) : null}
            {chosen ? (
              <span aria-hidden="true" className="service-chosen-mark">
                Chosen
              </span>
            ) : null}
          </span>
          <span className="muted">{formatDuration(item.duration_min)}</span>
          {toBusiness > 0 && (
            <span className="muted">
              {businessDepositLabel(toBusiness, currency)}
            </span>
          )}
          {due > 0 && (
            <span className="muted">
              {due < item.price_minor
                ? `Deposit ${formatMoney(due, currency)} paid now`
                : "Paid now"}
            </span>
          )}
        </span>
        <span className="service-price">
          {formatMoney(item.price_minor, currency)}
        </span>
      </label>
      {chosen ? (
        <ServiceDetails
          addOnsChosen={addOnsChosen}
          id={detailsId}
          service={item}
          storefront={storefront}
        />
      ) : null}
    </div>
  );
}

/**
 * The service choices. One category (or none) is a flat list under its heading,
 * as before. Two or more categories are disclosures: one is open at first (the
 * chosen or "Book again" service's, else the first), and the chosen service is
 * always visible, either in its open category or named on its closed summary.
 * The chosen service's row also shows its details; only one row does.
 */
export function ServiceList({
  addOnsChosen = false,
  bookAgainIds,
  onPick,
  selectedId,
  services,
  storefront,
}: ServiceListProps) {
  const groups = groupServicesByCategory(services);
  // The user's own open/closed choices per category key. A category with no
  // choice follows the default.
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  const [seenId, setSeenId] = useState<string | null>(selectedId);
  const defaultKey = defaultOpenCategory(groups, selectedId, bookAgainIds);
  const chosenKey =
    groups.find((group) => group.services.some((s) => s.id === selectedId))
      ?.key ?? null;

  // A new choice (a radio, or a "Book again" shortcut) opens the category it
  // lands in, even if the visitor had closed it. Done during render, so the
  // category never flashes closed.
  if (seenId !== selectedId) {
    setSeenId(selectedId);
    if (chosenKey !== null && chosenKey in toggled) {
      const key = chosenKey;
      setToggled(
        Object.fromEntries(
          Object.entries(toggled).filter(([name]) => name !== key)
        )
      );
    }
  }

  if (groups.length <= 1) {
    return groups.map((group) => (
      <div className="service-group" key={group.key}>
        <h3>{group.label}</h3>
        {group.services.map((item) => (
          <ServiceOption
            addOnsChosen={addOnsChosen}
            item={item}
            key={item.id}
            onPick={onPick}
            selectedId={selectedId}
            storefront={storefront}
          />
        ))}
      </div>
    ));
  }

  return (
    <div className="service-categories">
      {groups.map((group) => {
        const chosen = group.services.find((s) => s.id === selectedId);
        const open = toggled[group.key] ?? group.key === defaultKey;
        return (
          <details
            className="service-category"
            key={group.key}
            onToggle={(event) => {
              const nowOpen = event.currentTarget.open;
              setToggled((previous) => ({ ...previous, [group.key]: nowOpen }));
            }}
            open={open}
          >
            <summary className="service-category-summary">
              <span className="service-category-head">
                <h3 className="service-category-name">{group.label}</h3>
                <span className="muted">
                  {serviceCountLabel(group.services.length)}
                </span>
                {chosen && (
                  <span className="muted service-category-chosen">
                    Chosen: {chosen.name}
                  </span>
                )}
              </span>
            </summary>
            <div className="service-category-body">
              {group.services.map((item) => (
                <ServiceOption
                  addOnsChosen={addOnsChosen}
                  item={item}
                  key={item.id}
                  onPick={onPick}
                  selectedId={selectedId}
                  storefront={storefront}
                />
              ))}
            </div>
          </details>
        );
      })}
    </div>
  );
}
