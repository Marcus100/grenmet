import { AlertTriangle, ChevronDown } from "lucide-react";

export function Alerts() {
  return (
    <div className="mb-4 flex cursor-pointer items-center justify-between border border-gray-500 bg-gm-risk-amber px-4 py-3">
      <div className="flex items-center gap-2 font-semibold text-gray-900 text-sm">
        <AlertTriangle className="h-5 w-5 shrink-0" />
        <span>Current warnings</span>
      </div>
      <ChevronDown className="h-5 w-5 text-gray-900" />
    </div>
  );
}
