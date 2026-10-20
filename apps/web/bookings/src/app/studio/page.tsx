import type { Metadata } from "next";
import { requireSession } from "@/lib/session";

export const metadata: Metadata = {
  title: "Studio",
};

/**
 * Placeholder. The proxy sends signed-out visitors to sign-in; this page then
 * asks FastAPI-backed session state again before rendering anything.
 */
export default async function StudioPage() {
  const session = await requireSession("/studio");

  return (
    <main
      className="mx-auto flex min-h-screen max-w-2xl flex-col gap-4 p-6"
      id="main-content"
    >
      <h1 className="font-semibold text-2xl">Studio</h1>
      <p className="text-muted-foreground">
        Signed in as {session.name}. Agenda, services and hours arrive in a
        later release.
      </p>
    </main>
  );
}
