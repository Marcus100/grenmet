"use client";

import Image from "next/image";
import { useState } from "react";
import { PORTFOLIO, type PortfolioCategory } from "@/data/site";

const FILTERS: { id: PortfolioCategory | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "lashes", label: "Lashes" },
  { id: "brows", label: "Brows" },
  { id: "skin", label: "Skin" },
];

export function PortfolioGallery() {
  const [filter, setFilter] = useState<PortfolioCategory | "all">("all");
  const shots = PORTFOLIO.filter(
    (shot) => filter === "all" || shot.category === filter
  );

  return (
    <>
      <fieldset aria-label="Filter portfolio" className="type-filter">
        {FILTERS.map((item) => (
          <button
            aria-pressed={filter === item.id}
            key={item.id}
            onClick={() => setFilter(item.id)}
            type="button"
          >
            {item.label}
          </button>
        ))}
      </fieldset>
      <ul className="gallery">
        {shots.map((shot) => (
          <li className={`shot ${shot.size ?? ""}`} key={shot.label}>
            {shot.image ? (
              <Image
                alt={shot.alt ?? shot.label}
                fill
                sizes="(max-width: 860px) 50vw, 33vw"
                src={shot.image}
              />
            ) : (
              <div className="ph">
                <svg aria-hidden="true" viewBox="0 0 24 24">
                  <rect height="14" rx="2" width="18" x="3" y="5" />
                  <circle cx="12" cy="12" r="3.5" />
                </svg>
                <small>Photo coming soon</small>
              </div>
            )}
            <span className="caption">{shot.label}</span>
          </li>
        ))}
      </ul>
    </>
  );
}
