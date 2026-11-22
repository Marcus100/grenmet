import { Button } from "@barrelsgd/ui/components/ui/button";
import type { Metadata } from "next";
import "./globals.css";

// Shown for any URL that matches no route. It bypasses the root layouts, so it
// imports its own stylesheet and renders its own document.

export const metadata: Metadata = {
  title: "Page not found",
};

export default function GlobalNotFound() {
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
              The address may be mistyped or the page may have moved. GMS
              content is on the weather site. Editors sign in to the content
              editor.
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
