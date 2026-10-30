import type { Metadata } from "next";
import Link from "next/link";
import { listMyOrganisations } from "@/lib/api";
import { getSession } from "@/lib/session";

export const metadata: Metadata = {
  title: "GMS Dashboard",
  description:
    "Raw numerical weather model guidance for Grenada, Carriacou and Petite Martinique, from the Grenada Meteorological Service.",
};

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await getSession();
  const organisations = session
    ? await listMyOrganisations(session.accessToken)
    : [];

  return (
    <>
      <section className="space-y-3">
        <h1 className="text-3xl font-semibold">GMS Dashboard</h1>
        <p className="text-muted-foreground max-w-2xl">
          Point forecasts straight from the global weather models, for the
          places that matter to Grenada: Maurice Bishop International Airport,
          Lauriston (Carriacou) and Petite Martinique. Compare ECMWF IFS, ECMWF
          AIFS and NOAA GFS out to ten days.
        </p>
        <p
          className="bg-muted max-w-2xl rounded-md border px-3 py-2 text-sm"
          role="note"
        >
          This is raw model guidance, not an official GMS forecast. For official
          forecasts and warnings, see the Grenada Meteorological Service.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">How access works</h2>
        <ol className="max-w-2xl list-decimal space-y-1 pl-5 text-sm">
          <li>Sign in with your Barrels account.</li>
          <li>
            An owner or admin of your organisation asks GMS to enable the
            dashboard for it.
          </li>
          <li>
            GMS reviews the request. Once approved, every member of the
            organisation can read the meteograms.
          </li>
        </ol>
      </section>

      {session ? (
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Your organisations</h2>
          {organisations.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              You are not a member of an organisation yet. Ask an organisation
              owner to invite you, then come back.
            </p>
          ) : (
            <ul className="divide-y rounded-md border">
              {organisations.map((organisation) => (
                <li
                  className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
                  key={organisation.id}
                >
                  <span>{organisation.name}</span>
                  {organisation.entitled ? (
                    <Link
                      className="text-sm underline underline-offset-4"
                      href={`/meteogram?org=${encodeURIComponent(organisation.id)}`}
                    >
                      Open meteogram
                    </Link>
                  ) : (
                    <Link
                      className="text-sm underline underline-offset-4"
                      href={`/access?org=${encodeURIComponent(organisation.id)}`}
                    >
                      {organisation.request_status === "pending"
                        ? "Request pending"
                        : "Request access"}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : (
        <a
          className="bg-primary text-primary-foreground inline-block rounded-md px-4 py-2 text-sm"
          href="/auth/start"
        >
          Sign in to get started
        </a>
      )}
    </>
  );
}
