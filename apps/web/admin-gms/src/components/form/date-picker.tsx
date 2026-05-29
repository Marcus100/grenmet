import flatpickr from "flatpickr";
import { useEffect } from "react";
import "flatpickr/dist/flatpickr.css";
import { CalenderIcon } from "../../icons";
import Label from "./Label";

type Hook = flatpickr.Options.Hook;
type DateOption = flatpickr.Options.DateOption;

interface PropsType {
  defaultDate?: DateOption;
  id: string;
  label?: string;
  mode?: "single" | "multiple" | "range" | "time";
  onChange?: Hook | Hook[];
  placeholder?: string;
}

export default function DatePicker({
  id,
  mode,
  onChange,
  label,
  defaultDate,
  placeholder,
}: PropsType) {
  useEffect(() => {
    const flatPickr = flatpickr(`#${id}`, {
      mode: mode || "single",
      static: true,
      monthSelectorType: "static",
      dateFormat: "Y-m-d",
      defaultDate,
      onChange,
    });

    return () => {
      if (!Array.isArray(flatPickr)) {
        flatPickr.destroy();
      }
    };
  }, [mode, onChange, id, defaultDate]);

  return (
    <div>
      {label && <Label htmlFor={id}>{label}</Label>}

      <div className="relative">
        <input
          className="h-11 w-full appearance-none rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-foreground text-sm shadow-gm-card placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/20"
          id={id}
          placeholder={placeholder}
        />

        <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground">
          <CalenderIcon className="size-6" />
        </span>
      </div>
    </div>
  );
}
