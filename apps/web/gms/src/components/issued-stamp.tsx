import { ClockIcon } from "lucide-react";
export function IssuedStamp({ label }: { label: string }) {
  return (
    <div className="flex items-start gap-2 text-body-sm text-gm-text-secondary">
      <ClockIcon aria-hidden="true" className="mt-1 size-4 shrink-0" />
      {label}
    </div>
  );
}
