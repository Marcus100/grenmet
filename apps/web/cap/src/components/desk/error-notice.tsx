import type { DeskError } from "@/lib/desk/errors";

/** A refused or failed desk action, with every problem listed on its own line. */
export function DeskErrorNotice({ error }: { error: DeskError | null }) {
  if (!error) return null;
  return (
    <div
      className="border-destructive bg-destructive/10 text-body-sm space-y-2 rounded-lg border p-4"
      role="alert"
    >
      <p className="text-destructive font-semibold">{error.title}</p>
      {error.items.length > 0 ? (
        <ul className="text-foreground list-disc space-y-1 pl-5">
          {[...new Set(error.items)].map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : null}
      {error.kind === "session" ? (
        <a className="text-info font-medium underline" href="/desk/signin">
          Sign in again
        </a>
      ) : null}
    </div>
  );
}
