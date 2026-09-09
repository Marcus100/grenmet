import { type ProductContent, productFields, productTitle } from "../products";

const DATE_SEPARATOR = /^(\d{4}-\d{2}-\d{2})T/;
export function ProductContentView({ content }: { content: ProductContent }) {
  const fields = productFields(content.kind);
  const sections = [...new Set(fields.map((f) => f.section))];
  return (
    <article className="space-y-6">
      <h2 className="font-semibold text-xl">{productTitle(content.kind)}</h2>
      {sections.map((section) => {
        const populated = fields.filter(
          (f) => f.section === section && content.values[f.key]?.trim()
        );
        if (!populated.length) return null;
        return (
          <section className="space-y-3" key={section}>
            <h3 className="border-b pb-2 font-semibold">{section}</h3>
            <dl className="grid gap-4 sm:grid-cols-2">
              {populated.map((f) => (
                <div
                  className={
                    f.type === "textarea" ? "sm:col-span-2" : undefined
                  }
                  key={f.key}
                >
                  <dt className="text-muted-foreground text-sm">{f.label}</dt>
                  <dd className="whitespace-pre-wrap break-words">
                    {content.values[f.key].replace(DATE_SEPARATOR, "$1 ")}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        );
      })}
    </article>
  );
}
