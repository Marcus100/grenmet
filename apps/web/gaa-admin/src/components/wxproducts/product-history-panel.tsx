import { Button } from "@barrelsgd/ui/components/ui/button";

export interface HistoryItem {
  action: string;
  actorName: string;
  changeSummary: string;
  createdAt: string;
  revision: number;
}

/** Revision history of a saved product, loaded on request. */
export function ProductHistoryPanel({
  history,
  onLoad,
  pending,
}: {
  history: HistoryItem[];
  onLoad: () => void;
  pending: boolean;
}) {
  return (
    <section className="space-y-3">
      <Button
        disabled={pending}
        onClick={onLoad}
        type="button"
        variant="outline"
      >
        View revision history
      </Button>
      <ul className="space-y-2">
        {history.map((item) => (
          <li className="rounded-lg border p-3 text-sm" key={item.revision}>
            Revision {item.revision} · {item.action} · {item.actorName} ·{" "}
            {item.createdAt}
            {item.changeSummary ? <p>{item.changeSummary}</p> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
