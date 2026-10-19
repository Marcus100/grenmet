"use client";

import {
  NativeSelect,
  NativeSelectOption,
} from "@barrelsgd/ui/components/ui/native-select";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { switchOrganiser } from "@/data/actions";
import type { OrganiserOption } from "@/domain/types";

/** Picks which organiser the console acts for; remembered in a cookie. */
export function OrganiserSwitcher({
  current,
  organisers,
}: {
  current: string;
  organisers: readonly OrganiserOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-1">
      <span className="text-caption text-muted-foreground">Organiser</span>
      <NativeSelect
        aria-label="Organiser"
        className="w-full"
        disabled={pending}
        onChange={(event) => {
          const slug = event.target.value;
          startTransition(async () => {
            await switchOrganiser(slug);
            router.refresh();
          });
        }}
        value={current}
      >
        {organisers.map((organiser) => (
          <NativeSelectOption key={organiser.slug} value={organiser.slug}>
            {organiser.name}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </div>
  );
}
