"use client";

import { Field, FieldLabel } from "@barrelsgd/ui/components/ui/field";
import { Input } from "@barrelsgd/ui/components/ui/input";
import { useState } from "react";
import {
  displayDescriptor,
  searchWmoFields,
  wmoReference,
} from "@/lib/wxproducts/wmo-reference";

export function WeatherReference() {
  const [query, setQuery] = useState("");
  const fields = searchWmoFields(query);
  return (
    <section
      aria-labelledby="weather-reference-title"
      className="space-y-4 rounded-lg border bg-card p-5 print:hidden"
    >
      <h2 className="font-semibold text-xl" id="weather-reference-title">
        WMO weather reference
      </h2>
      <p className="text-muted-foreground text-sm">
        Selected observation fields and code meanings from BUFR edition{" "}
        {wmoReference.edition}, table version {wmoReference.version}, and Common
        Code Tables effective {wmoReference.effectiveDate}. These are BUFR
        definitions; numeric codes are not interchangeable with METAR, SPECI or
        TAF text groups.
      </p>
      <Field>
        <FieldLabel htmlFor="weather-reference-search">
          Find a field or code meaning
        </FieldLabel>
        <Input
          id="weather-reference-search"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Try wind, rain, pressure, or 0-12-101"
          type="search"
          value={query}
        />
      </Field>
      <p aria-live="polite" className="text-muted-foreground text-sm">
        {fields.length} matching fields
      </p>
      {fields.length === 0 ? (
        <p>
          No matching fields in this selected reference. This does not mean the
          descriptor is invalid.
        </p>
      ) : null}
      <div className="max-h-96 space-y-2 overflow-y-auto">
        {fields.map((field) => (
          <details className="rounded-md border p-3" key={field.id}>
            <summary className="cursor-pointer font-medium">
              {field.name}{" "}
              <span className="font-mono text-muted-foreground text-sm">
                {displayDescriptor(field.id)}
              </span>
            </summary>
            <div className="mt-3 space-y-3 text-sm">
              <p>
                BUFR unit: {field.unit} · {field.status}
              </p>
              <p className="text-muted-foreground">
                Base encoding: scale {field.scale}, reference {field.reference},
                width {field.bits} bits. Operators can modify encoding; these
                are not physical quality limits.
              </p>
              {field.notes.map((note) => (
                <p key={note}>{note}</p>
              ))}
              {field.codes.length > 0 ? (
                <ul className="space-y-2">
                  {field.codes.map((entry) => (
                    <li key={`${entry.code}:${entry.meaning}`}>
                      {entry.code ? (
                        <>
                          <span className="font-mono">{entry.code}</span> —{" "}
                        </>
                      ) : null}
                      {entry.meaning}
                      {entry.status === "Operational" ? null : (
                        <span> ({entry.status})</span>
                      )}
                      {entry.notes.map((note) => (
                        <p className="text-muted-foreground" key={note}>
                          {note}
                        </p>
                      ))}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </details>
        ))}
      </div>
      <details>
        <summary className="cursor-pointer font-medium">
          SYNOP, METAR and SPECI report classifications
        </summary>
        <ul className="mt-3 space-y-2 text-sm">
          {wmoReference.categories.map((category) => (
            <li key={`${category.category}:${category.subcategory}`}>
              BUFR category {category.category}, subcategory{" "}
              {category.subcategory}: {category.name}
            </li>
          ))}
        </ul>
      </details>
      <details>
        <summary className="cursor-pointer font-medium">
          BUFR report sequences
        </summary>
        <p className="my-3 text-muted-foreground text-sm">
          Top-level members only; nested sequences and replication require a
          BUFR decoder. This reference is not an encoder.
        </p>
        {wmoReference.sequences.map((sequence) => (
          <details
            className="mb-2 rounded-md border p-3 text-sm"
            key={sequence.id}
          >
            <summary className="cursor-pointer">
              {displayDescriptor(sequence.id)} · {sequence.name}
            </summary>
            <ol className="mt-3 list-decimal space-y-1 pl-5">
              {sequence.members.map((member) => (
                <li key={`${sequence.id}:${member.position}`}>
                  {displayDescriptor(member.id)} · {member.name}
                  {member.description ? ` — ${member.description}` : ""}
                </li>
              ))}
            </ol>
          </details>
        ))}
      </details>
      <details>
        <summary className="cursor-pointer font-medium">
          IWXXM and TAF resources
        </summary>
        <div className="mt-3 space-y-2 text-sm">
          <p>
            IWXXM represents aviation reports in XML. Its schema and validation
            rules are separate from these BUFR tables. The composer currently
            saves text drafts; it does not convert or validate IWXXM.
          </p>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <a className="underline" href="https://github.com/wmo-im/iwxxm">
                WMO IWXXM schemas and Schematron rules
              </a>
            </li>
            <li>
              <a
                className="underline"
                href="https://github.com/EMPIRIC2/TAC-to-IWXXM"
              >
                TAC-to-IWXXM conversion project
              </a>
            </li>
          </ul>
          <p>
            Shared forecast qualifiers in this reference do not provide complete
            TAF syntax or issuance rules.
          </p>
        </div>
      </details>
      <details>
        <summary className="cursor-pointer text-sm">
          Sources and licences
        </summary>
        <div className="mt-3 space-y-3 text-sm">
          <p>
            <a
              className="underline"
              href="https://github.com/wmo-im/BUFR4/tree/v46"
            >
              WMO BUFR version 46
            </a>{" "}
            ·{" "}
            <a
              className="underline"
              href="https://github.com/wmo-im/CCT/tree/v2026-06-01"
            >
              WMO Common Code Tables, June 2026
            </a>
          </p>
          {Object.entries(wmoReference.licenses).map(([name, license]) => (
            <div key={name}>
              <h3 className="font-medium">{name}</h3>
              <pre className="whitespace-pre-wrap font-sans text-xs">
                {license}
              </pre>
            </div>
          ))}
        </div>
      </details>
    </section>
  );
}
