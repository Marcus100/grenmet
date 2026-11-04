import {
  LEGACY_CLIMATE_FIELDS,
  type ProductContent,
  type ProductField,
  presentationFields,
  productTitle,
} from "../products";

const DATE_SEPARATOR = /^(\d{4}-\d{2}-\d{2})T/u;
const RANGE_FROM = /^(.*), from$/u;
// Editor hints live in a label's parentheses; they are not for the public page.
const EDITOR_HINT = /\s*\([^)]*\)/gu;
const UP_TO_HINT = /'up to'/u;
const ZERO = /^0(\.0+)?$/u;
interface Row {
  key: string;
  label: string;
  type?: ProductField["type"];
  value: string;
}
function rangeValue(low: string, high: string, upTo: boolean) {
  if (high && (!low || (upTo && ZERO.test(low)))) return `up to ${high}`;
  return low && high ? `${low} to ${high}` : low;
}
/**
 * One row per field, except a "..., from" / "..., to" pair of numbers, which
 * reads as one row ("373 to 428"). A lone end reads "up to" or the number.
 */
function rowsOf(fields: ProductField[], values: Record<string, string>) {
  const rows: Row[] = [];
  const merged = new Set<string>();
  const textOf = (key: string) => values[key]?.trim() ?? "";
  for (const f of fields) {
    if (merged.has(f.key)) continue;
    const base = RANGE_FROM.exec(f.label)?.[1];
    const max = base
      ? fields.find((g) => g.label === `${base}, to` && g.section === f.section)
      : undefined;
    const value = max
      ? rangeValue(textOf(f.key), textOf(max.key), UP_TO_HINT.test(f.label))
      : textOf(f.key);
    if (max) merged.add(max.key);
    if (value) {
      rows.push({
        key: f.key,
        label: max && base ? base.replace(EDITOR_HINT, "") : f.label,
        type: f.type,
        value,
      });
    }
  }
  return rows;
}
export function ProductContentView({ content }: { content: ProductContent }) {
  const fields = presentationFields(content.kind);
  const sections = [...new Set(fields.map((f) => f.section))];
  const earlier =
    content.kind === "climate-bulletin"
      ? LEGACY_CLIMATE_FIELDS.filter((f) => content.values[f.key]?.trim())
      : [];
  return (
    <article className="space-y-6">
      <h2 className="text-xl font-semibold">{productTitle(content.kind)}</h2>
      {sections.map((section) => {
        const populated = rowsOf(
          fields.filter((f) => f.section === section),
          content.values
        );
        if (!populated.length) return null;
        return (
          <section className="space-y-3" key={section}>
            <h3 className="border-b pb-2 font-semibold">{section}</h3>
            <dl className="grid gap-4 sm:grid-cols-2">
              {populated.map((row) => (
                <div
                  className={
                    row.type === "textarea" ? "sm:col-span-2" : undefined
                  }
                  key={row.key}
                >
                  <dt className="text-muted-foreground text-sm">{row.label}</dt>
                  <dd className="break-words whitespace-pre-wrap">
                    {row.value.replace(DATE_SEPARATOR, "$1 ")}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        );
      })}
      {earlier.length ? (
        <section className="space-y-3">
          <h3 className="border-b pb-2 font-semibold">Earlier format</h3>
          <dl className="grid gap-4">
            {earlier.map((f) => (
              <div key={f.key}>
                <dt className="text-muted-foreground text-sm">{f.label}</dt>
                <dd className="break-words whitespace-pre-wrap">
                  {content.values[f.key]}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}
    </article>
  );
}
