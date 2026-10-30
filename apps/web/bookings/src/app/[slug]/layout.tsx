import {
  BARRELS_SUPPORT_EMAIL,
  BARRELS_SUPPORT_HREF,
} from "@barrelsgd/ui/lib/support";

export default function BusinessLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col px-4 sm:px-6">
      <main className="flex-1 py-10" id="main-content">
        {children}
      </main>
      <footer className="flex flex-col gap-1 border-border border-t py-6 text-muted-foreground text-sm">
        <span>Booking by Barrels</span>
        <span>
          Problems with the booking service itself? Email Barrels Grenada
          support at{" "}
          <a
            className="text-foreground underline underline-offset-4"
            href={BARRELS_SUPPORT_HREF}
          >
            {BARRELS_SUPPORT_EMAIL}
          </a>
          .
        </span>
      </footer>
    </div>
  );
}
