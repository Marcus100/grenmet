import Link from "next/link";

export function CapAdminUnavailable() {
  return (
    <div className="space-y-4 p-6">
      <Link className="underline" href="/cap">
        Back to CAP
      </Link>
      <p role="alert">
        This CAP administration view could not be loaded. Check your session,
        permissions and connection, then reload.
      </p>
    </div>
  );
}

export function CapAdminHeading({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mx-auto max-w-5xl space-y-6 p-6">
      <Link className="underline" href="/cap">
        Back to CAP
      </Link>
      <h1 className="font-semibold text-2xl">{title}</h1>
      {children}
    </section>
  );
}
