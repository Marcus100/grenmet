import { Button } from "@grenmet/ui/components/ui/button";

import { ExternalLink } from "lucide-react";
import Link from "next/link";

export default function Page() {
  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h1 className="font-medium text-sm leading-none">Mail preview</h1>
          <p className="text-muted-foreground text-sm">
            This iframe shows the standalone mail screen. Open it in full screen
            for a better view.
          </p>
        </div>
        <Button
          nativeButton={false}
          render={
            <Link
              aria-label="Open mail in new tab"
              href="/mail"
              prefetch={false}
              rel="noreferrer"
              target="_blank"
            />
          }
          size="icon-sm"
          variant="ghost"
        >
          <ExternalLink />
        </Button>
      </div>

      <iframe
        className="min-h-0 flex-1 rounded-lg border bg-background"
        src="/mail"
        title="Mail preview"
      />
    </div>
  );
}
