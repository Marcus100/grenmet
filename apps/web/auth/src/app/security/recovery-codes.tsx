"use client";
import { CheckIcon, CopyIcon, DownloadIcon } from "lucide-react";
import { useState } from "react";

export function RecoveryCodes({ codes }: { codes: readonly string[] }) {
  const [copied, setCopied] = useState(false);
  const text = codes.join("\n");

  return (
    <div className="space-y-3">
      <ul className="grid grid-cols-2 gap-2 rounded-lg border border-border bg-muted p-4 font-mono text-sm">
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ul>
      <div className="flex gap-2">
        <button
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 font-medium text-foreground text-sm transition hover:bg-muted"
          onClick={async () => {
            await navigator.clipboard.writeText(text);
            setCopied(true);
          }}
          type="button"
        >
          {copied ? (
            <CheckIcon aria-hidden="true" className="size-4" />
          ) : (
            <CopyIcon aria-hidden="true" className="size-4" />
          )}
          {copied ? "Copied" : "Copy"}
        </button>
        <a
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 font-medium text-foreground text-sm transition hover:bg-muted"
          download="grenmet-recovery-codes.txt"
          href={`data:text/plain;charset=utf-8,${encodeURIComponent(text)}`}
        >
          <DownloadIcon aria-hidden="true" className="size-4" />
          Download
        </a>
      </div>
      <p className="text-muted-foreground text-sm">
        Keep these somewhere private. Each code works once, in place of an
        authenticator code.
      </p>
    </div>
  );
}
