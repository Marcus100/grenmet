"use client";

import { Button } from "@barrelsgd/ui/components/ui/button";
import { Check } from "lucide-react";
import { useState } from "react";
import type { ActionResult } from "@/data/action-result";
import { useMemberAction } from "./use-member-action";

/** Follow / Join style toggle backed by a server action. */
export function ToggleButton({
  action,
  activeLabel,
  className,
  idleLabel,
  initiallyActive = false,
}: {
  /** Receives the wanted state; e.g. `setFollowing.bind(null, slug)`. */
  action: (next: boolean) => Promise<ActionResult<unknown>>;
  activeLabel: string;
  className?: string;
  idleLabel: string;
  initiallyActive?: boolean;
}) {
  const [active, setActive] = useState(initiallyActive);
  const { error, pending, perform } = useMemberAction();

  async function toggle() {
    const next = !active;
    const result = await perform(() => action(next));
    if (result.ok) {
      setActive(next);
    }
  }

  return (
    <div className="space-y-1">
      <Button
        aria-pressed={active}
        className={className}
        disabled={pending}
        onClick={toggle}
        size="lg"
        variant={active ? "outline" : "default"}
      >
        {active ? <Check data-icon="inline-start" /> : null}
        {active ? activeLabel : idleLabel}
      </Button>
      {error ? (
        <p className="text-caption text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
