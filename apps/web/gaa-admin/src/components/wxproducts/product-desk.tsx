"use client";

import { ProductContentView } from "@barrelsgd/gms/components/product-content";
import {
  emptyProduct,
  grenadaDate,
  ISSUE_TIMES,
  isBulletin,
  type ProductKind,
  type ProductValues,
  productTitle,
  type StoredProduct,
  validateProduct,
} from "@barrelsgd/gms/products";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@barrelsgd/ui/components/ui/alert-dialog";
import { Button } from "@barrelsgd/ui/components/ui/button";
import { Field, FieldLabel } from "@barrelsgd/ui/components/ui/field";
import { Input } from "@barrelsgd/ui/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@barrelsgd/ui/components/ui/select";
import { Textarea } from "@barrelsgd/ui/components/ui/textarea";
import { useForm } from "@tanstack/react-form";
import { useEffect, useState, useTransition } from "react";
import {
  loadProductHistoryAction,
  loadProductsAction,
  saveProductAction,
} from "@/app/(admin)/wxproducts/product-actions";
import { ProductPdfPreview } from "@/components/wxproducts/product-pdf-preview";
import { bulletinExample } from "@/lib/wxproducts/bulletin-examples";
import { visibleProductFields } from "@/lib/wxproducts/visible-fields";

interface HistoryItem {
  action: string;
  actorName: string;
  changeSummary: string;
  createdAt: string;
  revision: number;
}
function ProductEditor({
  kind,
  initial,
  issueDate,
  issueTime,
  onSaved,
  onDirty,
  onBusy,
  disabled,
}: {
  kind: ProductKind;
  initial: StoredProduct | null;
  issueDate: string;
  issueTime: string;
  onSaved: (product: StoredProduct) => void;
  onDirty: (dirty: boolean) => void;
  onBusy: (busy: boolean) => void;
  disabled: boolean;
}) {
  const [id] = useState(() => initial?.id ?? crypto.randomUUID());
  const [revision, setRevision] = useState(initial?.revision ?? 0);
  const [publishedRevision, setPublishedRevision] = useState(
    initial?.publishedRevision ?? null
  );
  const [baseline, setBaseline] = useState(
    JSON.stringify(initial?.values ?? emptyProduct(kind, issueDate, issueTime))
  );
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [preview, setPreview] = useState<ProductValues | null>(null);
  const [reviewed, setReviewed] = useState(false);
  const [changeSummary, setChangeSummary] = useState("");
  const [message, setMessage] = useState("");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [pending, startTransition] = useTransition();
  const form = useForm({
    defaultValues: initial?.values ?? emptyProduct(kind, issueDate, issueTime),
  });
  const fields = visibleProductFields(kind);
  const sections = [...new Set(fields.map((f) => f.section))];
  async function save(
    values: ProductValues,
    action: "draft" | "publish" | "withdraw"
  ) {
    const result = await saveProductAction({
      id,
      expectedRevision: revision,
      kind,
      values,
      action,
      changeSummary,
      reviewed,
    });
    if (!result.ok) {
      setMessage(result.error);
      return;
    }
    setRevision(result.product.revision);
    setPublishedRevision(result.product.publishedRevision);
    setBaseline(JSON.stringify(result.product.values));
    if (action === "withdraw") form.reset(result.product.values);
    setPreview(null);
    setReviewed(false);
    setChangeSummary("");
    setHistory([]);
    onDirty(false);
    onSaved(result.product);
    setMessage(
      action === "publish"
        ? "Published. GMS will show this product during its validity period."
        : action === "withdraw"
          ? "Withdrawn from the public website."
          : "Draft saved."
    );
  }
  function submit(
    values: ProductValues,
    action: "draft" | "publish" | "withdraw"
  ) {
    onBusy(true);
    startTransition(async () => {
      try {
        await save(values, action);
      } finally {
        onBusy(false);
      }
    });
  }
  function review(values: ProductValues) {
    const errors = validateProduct({ kind, values }, true);
    if (errors.length) {
      setMessage(errors.join("\n"));
      setPreview(null);
      return;
    }
    setMessage("");
    setReviewed(false);
    setPreview(structuredClone(values));
  }
  return (
    <form.Subscribe selector={(s) => s.values}>
      {(values) => {
        const dirty = JSON.stringify(values) !== baseline;
        const previewCurrent =
          preview !== null &&
          JSON.stringify(preview) === JSON.stringify(values);
        return (
          <div className="@container">
            <div className="grid @4xl:grid-cols-2 items-start gap-5">
              <div className="space-y-5">
                <DirtyState dirty={dirty} onDirty={onDirty} />
                <AlertDialog onOpenChange={setWithdrawOpen} open={withdrawOpen}>
                  <AlertDialogContent>
                    <AlertDialogTitle>Withdraw publication?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This removes the published product from GMS. Its revision
                      history remains.
                    </AlertDialogDescription>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        disabled={pending}
                        onClick={() => {
                          setWithdrawOpen(false);
                          submit(values, "withdraw");
                        }}
                      >
                        Confirm withdrawal
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                {isBulletin(kind) && revision === 0 ? (
                  <Button
                    onClick={() => {
                      form.reset(bulletinExample(kind, issueDate));
                      setMessage(
                        "Illustrative draft loaded. Replace the example wording and review before issuing."
                      );
                    }}
                    type="button"
                    variant="outline"
                  >
                    Load example draft
                  </Button>
                ) : null}
                <p className="text-muted-foreground text-sm">
                  {revision ? `Saved revision ${revision}` : "New draft"}
                  {publishedRevision
                    ? ` · Published revision ${publishedRevision}`
                    : " · Not published"}
                </p>
                {message ? (
                  <p
                    className="whitespace-pre-wrap rounded-lg border p-4 text-sm"
                    role="status"
                  >
                    {message}
                  </p>
                ) : null}
                <form
                  className="space-y-4"
                  onSubmit={(event) => {
                    event.preventDefault();
                    submit(values, "draft");
                  }}
                >
                  <fieldset
                    className="space-y-4"
                    disabled={pending || disabled}
                  >
                    {sections.map((section) => (
                      <section
                        className="space-y-4 rounded-xl border bg-card p-4"
                        key={section}
                      >
                        <h2 className="font-semibold">{section}</h2>
                        <div className="grid gap-4 md:grid-cols-2">
                          {fields
                            .filter((f) => f.section === section)
                            .map((f) => (
                              <form.Field key={f.key} name={f.key}>
                                {(input) => {
                                  const inputId = `${kind}-${f.key}`;
                                  return (
                                    <Field
                                      className={
                                        f.type === "textarea"
                                          ? "md:col-span-2"
                                          : undefined
                                      }
                                    >
                                      <FieldLabel htmlFor={inputId}>
                                        {f.label}
                                        {f.required ? " *" : ""}
                                      </FieldLabel>
                                      {f.options ? (
                                        <Select
                                          onValueChange={(value) =>
                                            input.handleChange(value ?? "")
                                          }
                                          value={input.state.value}
                                        >
                                          <SelectTrigger id={inputId}>
                                            <SelectValue placeholder="Select…" />
                                          </SelectTrigger>
                                          <SelectContent>
                                            {f.options.map((option) => (
                                              <SelectItem
                                                key={option}
                                                value={option}
                                              >
                                                {option}
                                              </SelectItem>
                                            ))}
                                          </SelectContent>
                                        </Select>
                                      ) : f.type === "textarea" ? (
                                        <Textarea
                                          id={inputId}
                                          maxLength={12_000}
                                          onChange={(e) =>
                                            input.handleChange(e.target.value)
                                          }
                                          rows={4}
                                          value={input.state.value ?? ""}
                                        />
                                      ) : (
                                        <Input
                                          id={inputId}
                                          maxLength={12_000}
                                          onChange={(e) =>
                                            input.handleChange(e.target.value)
                                          }
                                          step={
                                            f.type === "number"
                                              ? "any"
                                              : undefined
                                          }
                                          type={f.type ?? "text"}
                                          value={input.state.value ?? ""}
                                        />
                                      )}
                                    </Field>
                                  );
                                }}
                              </form.Field>
                            ))}
                        </div>
                      </section>
                    ))}
                    <p className="text-muted-foreground text-sm">
                      * Required to publish. All issue and validity times use
                      Grenada time (UTC−04:00).
                    </p>
                    <Field>
                      <FieldLabel htmlFor="change-summary">
                        Issue / revision note
                      </FieldLabel>
                      <Textarea
                        id="change-summary"
                        maxLength={1000}
                        onChange={(e) => setChangeSummary(e.target.value)}
                        value={changeSummary}
                      />
                    </Field>
                    <div className="flex flex-wrap gap-3">
                      <Button type="submit">Save draft</Button>
                      <Button
                        onClick={() => review(values)}
                        type="button"
                        variant="outline"
                      >
                        Validate and preview
                      </Button>
                      {publishedRevision ? (
                        <Button
                          onClick={() => {
                            if (!changeSummary.trim()) {
                              setMessage(
                                "Explain the withdrawal in the revision note."
                              );
                              return;
                            }
                            setWithdrawOpen(true);
                          }}
                          type="button"
                          variant="outline"
                        >
                          Withdraw publication
                        </Button>
                      ) : null}
                    </div>
                  </fieldset>
                </form>
                {previewCurrent && preview ? (
                  <section
                    aria-label="Publication preview"
                    className="space-y-5 rounded-xl border bg-card p-5"
                  >
                    <p className="font-semibold text-sm">
                      Review before publication
                    </p>
                    <ProductContentView content={{ kind, values: preview }} />
                    <label className="flex items-start gap-3 text-sm">
                      <input
                        checked={reviewed}
                        disabled={pending}
                        onChange={(e) => setReviewed(e.target.checked)}
                        type="checkbox"
                      />
                      I have checked the content, affected areas and validity
                      times and authorize publication.
                    </label>
                    <Button
                      disabled={!reviewed || pending}
                      onClick={() => submit(preview, "publish")}
                      type="button"
                    >
                      Publish to GMS
                    </Button>
                  </section>
                ) : null}
                {revision ? (
                  <section className="space-y-3">
                    <Button
                      disabled={pending}
                      onClick={() =>
                        startTransition(async () => {
                          const result = await loadProductHistoryAction(id);
                          if (result.ok) setHistory(result.history);
                          else setMessage(result.error);
                        })
                      }
                      type="button"
                      variant="outline"
                    >
                      View revision history
                    </Button>
                    <ul className="space-y-2">
                      {history.map((item) => (
                        <li
                          className="rounded-lg border p-3 text-sm"
                          key={item.revision}
                        >
                          Revision {item.revision} · {item.action} ·{" "}
                          {item.actorName} · {item.createdAt}
                          {item.changeSummary ? (
                            <p>{item.changeSummary}</p>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}
              </div>
              <aside className="@4xl:sticky @4xl:top-4 min-w-0">
                <ProductPdfPreview content={{ kind, values }} />
              </aside>
            </div>
          </div>
        );
      }}
    </form.Subscribe>
  );
}
function DirtyState({
  dirty,
  onDirty,
}: {
  dirty: boolean;
  onDirty: (dirty: boolean) => void;
}) {
  useEffect(() => {
    onDirty(dirty);
  }, [dirty, onDirty]);
  useEffect(() => {
    if (!dirty) return;
    function beforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
    }
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty]);
  return null;
}
export function ProductDesk({
  kinds,
  title,
  initialKind,
}: {
  kinds: ProductKind[];
  title: string;
  initialKind?: ProductKind;
}) {
  const [kind, setKind] = useState(initialKind ?? kinds[0]);
  const [issueDate, setIssueDate] = useState(grenadaDate);
  const [issueTime, setIssueTime] = useState(
    ISSUE_TIMES[initialKind ?? kinds[0]]?.[0] ?? ""
  );
  const [discard, setDiscard] = useState<(() => void) | null>(null);
  const [products, setProducts] = useState<StoredProduct[]>([]);
  const [selected, setSelected] = useState<StoredProduct | null>(null);
  const [editorKey, setEditorKey] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    if (reload < 0) return;
    let active = true;
    setLoading(true);
    setLoadError("");
    loadProductsAction(kind, issueDate)
      .then((result) => {
        if (!active) return;
        if (result.ok) setProducts(result.products);
        else {
          setProducts([]);
          setLoadError(result.error);
        }
        setLoading(false);
      })
      .catch(() => {
        if (active) {
          setLoadError("Could not load products.");
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [kind, issueDate, reload]);
  function leave(action: () => void) {
    if (saving) return;
    if (dirty) setDiscard(() => action);
    else action();
  }
  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="font-semibold text-2xl">{title}</h1>
        <p className="text-muted-foreground text-sm">
          Save a draft, check the preview, then publish. Revisions preserve the
          currently published product until you issue the update.
        </p>
      </header>
      <div className="flex flex-wrap gap-2">
        {kinds.map((value) => (
          <Button
            key={value}
            onClick={() => {
              if (value === kind) return;
              leave(() => {
                setKind(value);
                setIssueTime(ISSUE_TIMES[value]?.[0] ?? "");
                setSelected(null);
                setDirty(false);
                setEditorKey((key) => key + 1);
              });
            }}
            type="button"
            variant={value === kind ? "default" : "outline"}
          >
            {productTitle(value)}
          </Button>
        ))}
      </div>

      <AlertDialog
        onOpenChange={(open) => {
          if (!open) setDiscard(null);
        }}
        open={discard !== null}
      >
        <AlertDialogContent>
          <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
          <AlertDialogDescription>
            Save a draft first if you want to keep these changes.
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                discard?.();
                setDiscard(null);
              }}
            >
              Discard changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="desk-date">Forecast / issue date</FieldLabel>
          <Input
            id="desk-date"
            onChange={(event) => {
              const date = event.target.value;
              if (!date) return;
              leave(() => {
                setIssueDate(date);
                setSelected(null);
                setDirty(false);
                setEditorKey((key) => key + 1);
              });
            }}
            type="date"
            value={issueDate}
          />
        </Field>
        {ISSUE_TIMES[kind] ? (
          <Field>
            <FieldLabel htmlFor="desk-time">
              Scheduled issue (Grenada time)
            </FieldLabel>
            <Select
              onValueChange={(value) => {
                if (!value) return;
                leave(() => {
                  setIssueTime(value);
                  setSelected(null);
                  setDirty(false);
                  setEditorKey((key) => key + 1);
                });
              }}
              value={issueTime}
            >
              <SelectTrigger id="desk-time">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ISSUE_TIMES[kind]?.map((time) => (
                  <SelectItem key={time} value={time}>
                    {time}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        ) : null}
      </div>
      <div className="space-y-3 rounded-xl border bg-card p-4">
        <h2 className="font-semibold">Saved products</h2>
        {loading ? (
          <p role="status">Loading…</p>
        ) : loadError ? (
          <div role="status">
            <p>{loadError}</p>
            <Button
              onClick={() => setReload((r) => r + 1)}
              type="button"
              variant="outline"
            >
              Retry
            </Button>
          </div>
        ) : products.some(
            (product) =>
              !product.values.issuedAt ||
              product.values.issuedAt.startsWith(issueDate)
          ) ? (
          <ul className="flex flex-wrap gap-2">
            {products
              .filter(
                (product) =>
                  !product.values.issuedAt ||
                  product.values.issuedAt.startsWith(issueDate)
              )
              .map((product) => (
                <li key={product.id}>
                  <Button
                    onClick={() => {
                      leave(() => {
                        setSelected(product);
                        setDirty(false);
                        setEditorKey((key) => key + 1);
                      });
                    }}
                    type="button"
                    variant="outline"
                  >
                    {product.values.issuedAt?.replace("T", " ") ||
                      "Undated draft"}{" "}
                    · {product.values.area || "No area"} · r{product.revision}
                    {product.publishedRevision ? " · Published" : " · Draft"}
                  </Button>
                </li>
              ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-sm">
            No saved products of this type.
          </p>
        )}
        <Button
          onClick={() => {
            leave(() => {
              setSelected(null);
              setDirty(false);
              setEditorKey((key) => key + 1);
            });
          }}
          type="button"
          variant="outline"
        >
          New {productTitle(kind)}
        </Button>
      </div>
      <ProductEditor
        disabled={loading}
        initial={selected}
        issueDate={issueDate}
        issueTime={issueTime}
        key={`${kind}-${editorKey}`}
        kind={kind}
        onBusy={setSaving}
        onDirty={setDirty}
        onSaved={(product) =>
          setProducts((items) => [
            product,
            ...items.filter((item) => item.id !== product.id),
          ])
        }
      />
    </div>
  );
}
