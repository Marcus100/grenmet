import { Button } from "@barrelsgd/ui/components/ui/button";
import type { Metadata } from "next";
import { getEnv } from "../env";
import { reportError } from "../lib/report-error";
import "./globals.css";

// Shown for any URL that matches no route. It bypasses the root layouts, so it
// imports its own stylesheet and renders its own document.

export const metadata: Metadata = {
  title: "Page not found",
};

/**
 * The weather site's public address, when this deployment knows it. A 404 must
 * still render if configuration is incomplete, so a failure falls back to plain
 * text (and is reported, not hidden).
 */
function weatherSiteAddress(): string | undefined {
  try {
    return getEnv().GMS_SITE_URL;
  } catch (error) {
    reportError(error, "cms-not-found");
    return undefined;
  }
}

export default function GlobalNotFound() {
  const weatherSite = weatherSiteAddress();
  return (
    <html lang="en">
      <body className="bg-background text-foreground min-h-dvh antialiased">
        <main
          className="flex min-h-dvh items-center justify-center p-4"
          id="main-content"
        >
          <section className="w-full max-w-sm space-y-4 text-center">
            <p className="text-muted-foreground text-sm">Error 404</p>
            <h1 className="text-2xl font-semibold">Page not found</h1>
            <p className="text-muted-foreground text-sm">
              The address may be mistyped or the page may have moved.{" "}
              {weatherSite ? (
                <>
                  GMS content is on the{" "}
                  <a className="text-primary underline" href={weatherSite}>
                    weather site
                  </a>
                  .
                </>
              ) : (
                "GMS content is on the weather site."
              )}{" "}
              Editors sign in to the content editor.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
              <Button
                className="min-h-11"
                nativeButton={false}
                render={<a href="/admin" />}
              >
                Open the editor
              </Button>
            </div>
          </section>
        </main>
      </body>
    </html>
  );
}
