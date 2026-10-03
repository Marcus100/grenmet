"use client";

import {
  capAlertListPublicSchema,
  publishedProductsSchema,
} from "@barrelsgd/api-client";
import {
  type CapInsertTarget,
  isBulletin,
  isProductKind,
  productTitle,
} from "@barrelsgd/gms/products";
import { Button } from "@barrelsgd/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@barrelsgd/ui/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@barrelsgd/ui/components/ui/tabs";
import { Megaphone } from "lucide-react";
import { useId, useState } from "react";

type Source = "cap" | "bulletin";

interface WarningOption {
  /** Copied into the forecast after the selected text. */
  attribution: string;
  key: string;
  label: string;
  meta: string;
  parts: { id: string; label: string; text: string }[];
  /** Changes whenever the source is revised, so stale text is never copied. */
  stamp: string;
}

const SOURCE_LABEL: Record<Source, string> = {
  cap: "CAP alert",
  bulletin: "GMS bulletin",
};
const BULLETIN_PARTS = [
  ["synopsis", "Synopsis"],
  ["weather", "Weather"],
  ["impacts", "Impacts"],
  ["response", "Response"],
] as const;

async function fetchJson(path: string) {
  const response = await fetch(path, {
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error("unavailable");
  return (await response.json()) as unknown;
}

async function loadOptions(source: Source): Promise<WarningOption[]> {
  if (source === "cap") {
    const alerts = capAlertListPublicSchema.parse(
      await fetchJson("/api/cap/latest-active")
    ).data;
    return alerts.flatMap((alert) =>
      (alert.info ?? []).map((info) => ({
        key: `${alert.id}/${info.id}`,
        label: `${info.headline} — ${alert.status} / ${alert.msg_type} — ${info.language} — ${alert.sent}`,
        meta: `Area: ${(info.areas ?? []).map((a) => a.area_desc).join(", ") || "Not specified"}. Effective: ${info.effective ?? alert.sent}. Onset: ${info.onset ?? "Not specified"}. Expires: ${info.expires ?? "Not specified"}.`,
        parts: (["headline", "description", "instruction"] as const)
          .filter((part) => info[part])
          .map((part) => ({ id: part, label: part, text: info[part] ?? "" })),
        attribution: `[CAP ${alert.identifier}; sender ${alert.sender}; issued ${alert.sent}]`,
        stamp: `${alert.sent}/${JSON.stringify(info)}`,
      }))
    );
  }
  const { products } = publishedProductsSchema.parse(
    await fetchJson("/api/public/products")
  );
  return products
    .filter(
      (product) => isProductKind(product.kind) && isBulletin(product.kind)
    )
    .map((product) => {
      const values = product.values;
      const title = isProductKind(product.kind)
        ? productTitle(product.kind)
        : product.kind;
      const issued = values.issuedAt?.replace("T", " ") ?? "";
      return {
        key: product.id,
        label: `${title} r${product.revision} — ${values.level || "No level"} — issued ${issued}`,
        meta: `Area: ${values.area || "Not specified"}. Valid: ${values.validFrom?.replace("T", " ") ?? "?"} to ${values.validTo?.replace("T", " ") ?? "?"}.`,
        parts: BULLETIN_PARTS.filter(([id]) => values[id]).map(
          ([id, label]) => ({ id, label, text: values[id] ?? "" })
        ),
        attribution: `[GMS ${title} r${product.revision}; issued ${issued}]`,
        stamp: `${product.revision}`,
      };
    });
}

export function CapForecastPicker({
  targets,
  onInsert,
  disabled = false,
}: {
  disabled?: boolean;
  targets: CapInsertTarget[];
  onInsert: (target: string, text: string) => void;
}) {
  const id = useId();
  const [source, setSource] = useState<Source>("cap");
  const [options, setOptions] = useState<WarningOption[]>([]);
  const [selection, setSelection] = useState("");
  const [parts, setParts] = useState<string[]>([]);
  const [target, setTarget] = useState(targets[0]?.value ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [open, setOpen] = useState(false);
  const chosen = options.find((option) => option.key === selection);
  const noun = SOURCE_LABEL[source];

  async function refresh(from: Source = source) {
    setBusy(true);
    setSelection("");
    setParts([]);
    try {
      const data = await loadOptions(from);
      setOptions(data);
      setMessage(
        data.length
          ? `Select a ${SOURCE_LABEL[from]} and the text to copy.`
          : `No current ${SOURCE_LABEL[from]}s are available.`
      );
    } catch {
      setOptions([]);
      setMessage(`${SOURCE_LABEL[from]}s could not be loaded. Try again.`);
    } finally {
      setBusy(false);
    }
  }
  async function insert() {
    if (!(chosen && parts.length)) return;
    setBusy(true);
    try {
      const latest = await loadOptions(source);
      const current = latest.find((option) => option.key === chosen.key);
      if (!current || current.stamp !== chosen.stamp) {
        setSelection("");
        setParts([]);
        setOptions(latest);
        setMessage(
          `This ${noun} changed or is no longer active. Select a current one.`
        );
        return;
      }
      const text = current.parts
        .filter((part) => parts.includes(part.id))
        .map((part) => part.text)
        .join("\n\n");
      onInsert(target, `${text}\n\n${current.attribution}`);
      setMessage(
        "Selected text copied. Review its area and validity against the forecast before publishing. Copied text does not update automatically."
      );
    } catch (error) {
      setMessage(
        error instanceof Error && error.message !== "unavailable"
          ? error.message
          : `Could not copy ${noun} text. Try again.`
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      onOpenChange={(next) => {
        setOpen(next);
        if (next) refresh();
      }}
      open={open}
    >
      <DialogTrigger
        render={
          <Button
            className="w-fit"
            disabled={disabled}
            type="button"
            variant="outline"
          >
            <Megaphone data-icon="inline-start" />
            Insert warning text
          </Button>
        }
      />
      <DialogContent className="max-h-[85svh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Insert warning text</DialogTitle>
          <DialogDescription>
            Copy text from a current CAP alert or GMS bulletin into this
            forecast. Check that its area and validity fit.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Tabs
              onValueChange={(value) => {
                const next = value as Source;
                if (next === source) return;
                setSource(next);
                setOptions([]);
                refresh(next);
              }}
              value={source}
            >
              <TabsList>
                <TabsTrigger value="cap">CAP alerts</TabsTrigger>
                <TabsTrigger value="bulletin">GMS bulletins</TabsTrigger>
              </TabsList>
            </Tabs>
            <Button
              disabled={busy}
              onClick={() => refresh()}
              size="sm"
              type="button"
              variant="outline"
            >
              Reload
            </Button>
          </div>
          {options.length ? (
            <>
              <label className="block text-sm" htmlFor={`${id}-source`}>
                {noun}
              </label>
              <select
                className="w-full rounded-md border bg-background p-2"
                disabled={busy}
                id={`${id}-source`}
                onChange={(event) => {
                  setSelection(event.target.value);
                  setParts([]);
                }}
                value={selection}
              >
                <option value="">Select a {noun}</option>
                {options.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
              {chosen ? (
                <>
                  <p className="text-sm">{chosen.meta}</p>
                  {chosen.parts.map((part) => (
                    <label
                      className="flex items-start gap-2 text-sm"
                      key={part.id}
                    >
                      <input
                        checked={parts.includes(part.id)}
                        disabled={busy}
                        onChange={(event) =>
                          setParts((current) =>
                            event.target.checked
                              ? [...current, part.id]
                              : current.filter((value) => value !== part.id)
                          )
                        }
                        type="checkbox"
                      />
                      <span className="whitespace-pre-wrap">
                        <strong className="capitalize">{part.label}: </strong>
                        {part.text}
                      </span>
                    </label>
                  ))}
                  <label className="block text-sm" htmlFor={`${id}-target`}>
                    Add to
                  </label>
                  <select
                    className="w-full rounded-md border bg-background p-2"
                    disabled={busy}
                    id={`${id}-target`}
                    onChange={(event) => setTarget(event.target.value)}
                    value={target}
                  >
                    {targets.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <Button
                    disabled={busy || !parts.length}
                    onClick={insert}
                    type="button"
                  >
                    Add selected text
                  </Button>
                </>
              ) : null}
            </>
          ) : null}
          {message ? (
            <p className="text-sm" role="status">
              {message}
            </p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
