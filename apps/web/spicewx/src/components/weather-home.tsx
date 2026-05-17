"use client";

import { AlertTriangle, ArrowRight } from "lucide-react";
import { useState } from "react";

const days = [
  { date: 17, month: "MAY", label: "Now" },
  { date: 18, month: "MAY", label: null },
  { date: 19, month: "MAY", label: null },
  { date: 20, month: "MAY", label: null },
  { date: 21, month: "MAY", label: null },
];

const CONDITIONS = [
  { label: "Max Temp", value: "31°C" },
  { label: "Min Temp", value: "24°C" },
  { label: "Wind Speed", value: "10–20 mph" },
  { label: "Wind Direction", value: "N to E" },
  { label: "Rain Chance", value: "40%" },
  { label: "Sea State", value: "Moderate to rough" },
  { label: "Wave Height", value: "6–9 ft" },
  { label: "Swell", value: "NE to E" },
  { label: "Low Tide", value: "12:30 pm" },
  { label: "High Tide", value: "05:50 am" },
  { label: "Sunset Today", value: "06:30 pm" },
  { label: "Sunrise Tomorrow", value: "5:30 am" },
];

const parishes = [
  { name: "St. George's", min: 24, max: 31 },
  { name: "St. Andrew's", min: 23, max: 30 },
  { name: "St. Patrick's", min: 22, max: 29 },
  { name: "St. David's", min: 23, max: 30 },
  { name: "St. John's", min: 24, max: 31 },
  { name: "Carriacou", min: 25, max: 32 },
];

const warnings = [
  { region: "St. George's", count: 1 },
  { region: "St. Andrew's", count: 1 },
  { region: "St. Patrick's", count: 0 },
  { region: "St. David's", count: 0 },
  { region: "St. John's", count: 0 },
  { region: "Carriacou", count: 1 },
];

export function WeatherHomeMobile() {
  const [selected, setSelected] = useState(days[0]);

  return (
    <div className="mb-4 w-full border border-gray-500">
      <div className="grid grid-cols-5 gap-1 bg-gm-surface p-1">
        {days.map((day) => {
          const isActive = day.date === selected.date;
          return (
            <button
              className={`flex flex-col items-center justify-center rounded py-2 ${
                isActive
                  ? "bg-gm-blue text-white"
                  : "text-gray-400 hover:text-gm-navy"
              }`}
              key={day.date}
              onClick={() => setSelected(day)}
              type="button"
            >
              <span className="font-bold text-lg leading-none">
                {day.label ?? day.date}
              </span>
              {!day.label && (
                <span className="mt-0.5 text-xs">{day.month}</span>
              )}
            </button>
          );
        })}
      </div>

      <div className="p-4">
        <h2 className="mb-4 text-center font-bold text-gm-blue text-sm uppercase tracking-widest">
          Key Conditions
        </h2>
        <div className="grid grid-cols-2 gap-x-4 gap-y-5">
          {CONDITIONS.map((item) => (
            <div className="flex items-center gap-3" key={item.label}>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gm-surface text-gm-blue text-xs">
                icon
              </div>
              <div>
                <p className="font-bold text-gm-navy text-sm">{item.value}</p>
                <p className="text-gray-500 text-xs">{item.label}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function WeatherHomeDesktop() {
  const [selected, setSelected] = useState(days[0]);

  return (
    <div className="flex overflow-hidden rounded-xl border border-gm-border bg-white shadow-sm">
      {/* Date strip */}
      <div className="flex flex-col border-gm-border border-r">
        {days.map((day) => {
          const isActive = day.date === selected.date;
          return (
            <button
              className={`flex w-16 flex-col items-center justify-center px-2 py-4 text-center transition-colors ${
                isActive
                  ? "border border-gray-300 bg-white font-bold text-gm-navy"
                  : "text-gray-400 hover:text-gm-navy"
              }`}
              key={day.date}
              onClick={() => setSelected(day)}
              type="button"
            >
              <span className="font-bold text-xl leading-none">{day.date}</span>
              <span className="mt-0.5 text-xs">{day.month}</span>
            </button>
          );
        })}
      </div>

      {/* Parish grid */}
      <div className="flex-1">
        <div className="grid grid-cols-3 divide-x divide-y divide-gm-border">
          {parishes.map((parish) => (
            <div className="p-4" key={parish.name}>
              <h3 className="font-bold text-gm-navy text-sm">{parish.name}</h3>
              <div className="mt-2 flex items-end gap-4">
                <div>
                  <span className="font-bold text-gm-navy text-xl">
                    {parish.min}°
                  </span>
                  <p className="text-gray-400 text-xs">Min</p>
                </div>
                <div>
                  <span className="font-bold text-gm-navy text-xl">
                    {parish.max}°
                  </span>
                  <p className="text-gray-400 text-xs">Max</p>
                </div>
              </div>
              <div className="mt-3 flex h-10 w-10 items-center justify-center rounded-full bg-gm-surface text-gm-blue text-xs">
                icon
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Warnings panel */}
      <div className="w-44 shrink-0">
        <a
          className="flex items-center justify-between bg-gm-risk-amber px-3 py-3 font-semibold text-gray-900 text-sm"
          href="/warnings"
        >
          <span className="flex items-center gap-1.5">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            Current warnings
          </span>
          <ArrowRight className="h-4 w-4 shrink-0" />
        </a>
        <div className="bg-gm-navy">
          {warnings.map((w) => (
            <div
              className="flex items-center gap-2 border-white/10 border-b px-3 py-2.5"
              key={w.region}
            >
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full font-bold text-xs ${
                  w.count > 0
                    ? "bg-gm-risk-amber text-gray-900"
                    : "bg-white/10 text-white/40"
                }`}
              >
                {w.count}
              </span>
              <span className="text-white text-xs">{w.region}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
