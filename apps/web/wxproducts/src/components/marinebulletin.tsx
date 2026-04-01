interface MarineBulletinProps {
  date?: string;
  email?: string;
  fax?: string;
  forecasterName?: string;
  impact?: string;
  impactItems?: string[];
  lastMoonPhase?: string;
  likelihood?: string;
  moonrise?: string;
  moonset?: string;
  nextMoonPhase?: string;
  organization?: string;
  response?: string;
  responseItems?: string[];
  seaState?: string;
  sunrise?: string;
  sunset?: string;
  synopsis?: string;
  telephones?: string;
  tideHigh1?: string;
  tideHigh2?: string;
  tideLow?: string;
  time?: string;
  validity?: string;
  visibility?: string;
  warningLevel?: string;
  weather?: string;
  wind?: string;
}

import { gmsMarineBulletinExample } from "@/data/gms-marine-bulletin.example";
import type { MarineBulletinProduct } from "@/db/schema";
import { adaptMarineBulletin } from "@/lib/adapters";

export default function MarineBulletin({
  product = gmsMarineBulletinExample,
}: {
  product?: MarineBulletinProduct;
}) {
  const {
    date,
    time,
    organization,
    validity,
    warningLevel,
    synopsis,
    weather,
    seaState,
    visibility,
    wind,
    tideHigh1,
    tideLow,
    tideHigh2,
    sunrise,
    sunset,
    forecasterName,
    email,
    telephones,
    fax,
  } = adaptMarineBulletin(product);
  const lastMoonPhase = "Waxing Gibbous";
  const nextMoonPhase =
    "Full Moon on " +
    (new Date().getMonth() + 1) +
    "/" +
    (new Date().getDate() + 3) +
    "/" +
    new Date().getFullYear();
  const moonrise = "08:45 PM";
  const moonset = "08:15 AM";
  const likelihood = "Medium";
  const impact = "Minor";
  const impactItems = [
    "Occasional rough seas",
    "Reduced visibility in showers",
    "Gusty winds near squalls",
  ];
  const response = "Be Aware";
  const responseItems = [
    "Heed all warnings and advisories",
    "Secure loose objects",
    "Proceed with caution",
  ];
  return (
    <div className="rounded-xl bg-white p-8 shadow-sm ring-1 ring-zinc-900/5">
      {/* Header Section */}
      <div className="mb-8">
        <div className="mb-4 flex items-start justify-between">
          <div className="font-medium text-sm text-zinc-700">
            <div>{date}</div>
            <div>{time}</div>
          </div>
          <div className="text-center">
            <h1 className="mb-1 font-semibold text-xl text-zinc-900 tracking-tight">
              MARINE BULLETIN
            </h1>
            <div className="font-medium text-xs text-zinc-600">
              {organization}
            </div>
          </div>
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded bg-zinc-800 font-bold text-white text-xs">
            GAA
          </div>
        </div>
        <div className="font-semibold text-xs text-zinc-700 uppercase tracking-wide">
          {validity}
        </div>
      </div>

      {/* Warning Level and Synopsis Section */}
      <div className="mb-6 flex gap-4">
        <div className="flex h-20 w-24 shrink-0 items-center justify-center rounded-lg bg-zinc-200 ring-1 ring-zinc-300">
          <span className="font-bold text-lg text-zinc-900 uppercase tracking-tight">
            {warningLevel}
          </span>
        </div>
        <div className="flex-1 space-y-3">
          <div className="rounded-lg bg-zinc-50 px-4 py-3 ring-1 ring-zinc-200">
            <div className="text-sm">
              <span className="font-semibold text-zinc-900">SYNOPSIS:</span>{" "}
              <span className="text-zinc-700">{synopsis}</span>
            </div>
          </div>
          <div className="rounded-lg bg-zinc-50 px-4 py-3 ring-1 ring-zinc-200">
            <div className="text-sm">
              <span className="font-semibold text-zinc-900">WEATHER:</span>{" "}
              <span className="text-zinc-700">{weather}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Wave Icons Placeholder */}
      <div className="mb-6 grid grid-cols-2 gap-4">
        <div className="rounded-lg bg-zinc-50 px-4 py-3 ring-1 ring-zinc-200">
          <div className="mb-2 font-semibold text-xs text-zinc-700 uppercase tracking-wide">
            West
          </div>
          <div className="flex h-12 items-center justify-center rounded bg-white text-xs text-zinc-500 ring-1 ring-zinc-200">
            [Wave Graphic]
          </div>
        </div>
        <div className="rounded-lg bg-zinc-50 px-4 py-3 ring-1 ring-zinc-200">
          <div className="mb-2 font-semibold text-xs text-zinc-700 uppercase tracking-wide">
            East
          </div>
          <div className="flex h-12 items-center justify-center rounded bg-white text-xs text-zinc-500 ring-1 ring-zinc-200">
            [Wave Graphic]
          </div>
        </div>
      </div>

      {/* Detailed Marine Conditions */}
      <div className="mb-6">
        <div className="mb-4 flex items-center gap-2">
          <span className="font-bold text-xs text-zinc-900 uppercase tracking-wide">
            LIKELIHOOD
          </span>
          <span className="rounded-full bg-zinc-900 px-2.5 py-0.5 font-bold text-white text-xs">
            {likelihood}
          </span>
        </div>
        <div className="space-y-2 rounded-lg bg-zinc-50 p-4 ring-1 ring-zinc-200">
          <div className="rounded bg-white px-4 py-2.5 ring-1 ring-zinc-200 ring-inset">
            <div className="text-sm">
              <span className="font-semibold text-zinc-900">SEA STATE:</span>{" "}
              <span className="text-zinc-700">{seaState}</span>
            </div>
          </div>
          <div className="rounded bg-white px-4 py-2.5 ring-1 ring-zinc-200 ring-inset">
            <div className="text-sm">
              <span className="font-semibold text-zinc-900">VISIBILITY:</span>{" "}
              <span className="text-zinc-700">{visibility}</span>
            </div>
          </div>
          <div className="rounded bg-white px-4 py-2.5 ring-1 ring-zinc-200 ring-inset">
            <div className="text-sm">
              <span className="font-semibold text-zinc-900">WIND:</span>{" "}
              <span className="text-zinc-700">{wind}</span>
            </div>
          </div>
          <div className="rounded bg-white px-4 py-2.5 ring-1 ring-zinc-200 ring-inset">
            <div className="text-sm">
              <span className="font-semibold text-zinc-900">TIDE:</span>{" "}
              <span className="text-zinc-700">
                High: {tideHigh1} Low: {tideLow} High: {tideHigh2}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Impact and Response Section */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-lg bg-zinc-50 p-4 ring-1 ring-zinc-200">
          <div className="mb-3 flex items-center gap-2">
            <span className="font-bold text-xs text-zinc-900 uppercase tracking-wide">
              IMPACT
            </span>
            <span className="rounded-full bg-zinc-700 px-2.5 py-0.5 font-bold text-white text-xs">
              {impact}
            </span>
          </div>
          <ul className="space-y-1.5 text-sm text-zinc-700">
            {impactItems?.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <div className="rounded-lg bg-zinc-50 p-4 ring-1 ring-zinc-200">
          <div className="mb-3 flex items-center gap-2">
            <span className="font-bold text-xs text-zinc-900 uppercase tracking-wide">
              RESPONSE
            </span>
            <span className="rounded-full bg-zinc-800 px-2.5 py-0.5 font-bold text-white text-xs">
              {response}
            </span>
          </div>
          <ul className="space-y-1.5 text-sm text-zinc-700">
            {responseItems?.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </div>

      {/* Astronomical Data */}
      <div className="mb-6 rounded-lg bg-zinc-50 p-4 ring-1 ring-zinc-200">
        <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
          <div>
            <div className="font-semibold text-xs text-zinc-700 uppercase tracking-wide">
              LAST MOON PHASE
            </div>
            <div className="mt-1 font-medium text-sm text-zinc-900">
              {lastMoonPhase}
            </div>
          </div>
          <div>
            <div className="font-semibold text-xs text-zinc-700 uppercase tracking-wide">
              NEXT MOON PHASE
            </div>
            <div className="mt-1 font-medium text-sm text-zinc-900">
              {nextMoonPhase}
            </div>
          </div>
          <div>
            <div className="font-semibold text-xs text-zinc-700 uppercase tracking-wide">
              MOONRISE
            </div>
            <div className="mt-1 font-medium text-sm text-zinc-900">
              {moonrise}
            </div>
          </div>
          <div>
            <div className="font-semibold text-xs text-zinc-700 uppercase tracking-wide">
              MOONSET
            </div>
            <div className="mt-1 font-medium text-sm text-zinc-900">
              {moonset}
            </div>
          </div>
          <div>
            <div className="font-semibold text-xs text-zinc-700 uppercase tracking-wide">
              SUNRISE
            </div>
            <div className="mt-1 font-medium text-sm text-zinc-900">
              {sunrise}
            </div>
          </div>
          <div>
            <div className="font-semibold text-xs text-zinc-700 uppercase tracking-wide">
              SUNSET
            </div>
            <div className="mt-1 font-medium text-sm text-zinc-900">
              {sunset}
            </div>
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="mb-6 border-zinc-200 border-t" />

      {/* Footer Section */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="text-sm">
          <div className="font-semibold text-zinc-900">
            FORECASTER {forecasterName}
          </div>
        </div>
      </div>
    </div>
  );
}
