"use client";

import type { BookingPublicService } from "@barrelsgd/api-client";
import { useState } from "react";
import { formatDuration, formatMoney } from "../lib/booking-format";
import { dueAtBooking } from "../lib/booking-payment";
import {
  defaultOpenCategory,
  groupServicesByCategory,
  serviceCountLabel,
} from "../lib/service-categories";

export interface ServiceListProps {
  /** Services shown as "Book again" shortcuts; the first one's category opens by default. */
  bookAgainIds: string[];
  currency: string;
  /** Chooses a service (the flow clears the time and loads the new times). */
  onPick: (serviceId: string) => void;
  selectedId: string | null;
  services: BookingPublicService[];
}

function ServiceOption({
  currency,
  item,
  onPick,
  selectedId,
}: {
  currency: string;
  item: BookingPublicService;
  onPick: (serviceId: string) => void;
  selectedId: string | null;
}) {
  const due = dueAtBooking(item);
  return (
    <label className="service-option">
      <input
        checked={item.id === selectedId}
        name="service"
        onChange={() => onPick(item.id)}
        type="radio"
        value={item.id}
      />
      <span className="service-text">
        <span className="service-name">{item.name}</span>
        <span className="muted">
          {formatDuration(item.duration_min)}
          {item.description ? ` · ${item.description}` : ""}
        </span>
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
  );
}

/**
 * The service radios. One category (or none) is a flat list under its heading,
 * as before. Two or more categories are disclosures: one is open at first (the
 * chosen or "Book again" service's, else the first), and the chosen service is
 * always visible, either in its open category or named on its closed summary.
 */
export function ServiceList({
  bookAgainIds,
  currency,
  onPick,
  selectedId,
  services,
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
            currency={currency}
            item={item}
            key={item.id}
            onPick={onPick}
            selectedId={selectedId}
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
                  currency={currency}
                  item={item}
                  key={item.id}
                  onPick={onPick}
                  selectedId={selectedId}
                />
              ))}
            </div>
          </details>
        );
      })}
    </div>
  );
}
