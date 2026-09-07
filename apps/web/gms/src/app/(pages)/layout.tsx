/**
 * Container for the standing content pages — everything outside the dated
 * weather surface, which keeps its own hero-and-alerts layout.
 */
export default function PagesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // Responsive container — intentional layout exception, not a spacing token
    <div className="mx-auto max-w-7xl px-4 pb-12 sm:px-6 lg:px-8">
      {children}
    </div>
  );
}
