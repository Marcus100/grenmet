export default function BusinessLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col px-4 sm:px-6">
      <main className="flex-1 py-10" id="main-content">
        {children}
      </main>
      <footer className="border-border border-t py-6 text-muted-foreground text-sm">
        Booking by Barrels
      </footer>
    </div>
  );
}
