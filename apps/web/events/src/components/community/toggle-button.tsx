"use client";

import { Button } from "@barrelsgd/ui/components/ui/button";
import { Check } from "lucide-react";
import { useState } from "react";

/** Follow / Join toggle, local state until the community API exists. */
export function ToggleButton({
  activeLabel,
  className,
  idleLabel,
  initiallyActive = false,
}: {
  activeLabel: string;
  className?: string;
  idleLabel: string;
  initiallyActive?: boolean;
}) {
  const [active, setActive] = useState(initiallyActive);

  return (
    <Button
      aria-pressed={active}
      className={className}
      onClick={() => setActive((value) => !value)}
      size="lg"
      variant={active ? "outline" : "default"}
    >
      {active ? <Check data-icon="inline-start" /> : null}
      {active ? activeLabel : idleLabel}
    </Button>
  );
}
