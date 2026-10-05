import { Download } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ElectionTimeline } from "@/components/election/election-timeline";
import { Photo } from "@/components/photo";
import { PageHead, Section } from "@/components/section";
import { SourceLink } from "@/components/source-link";
import { COVERAGE, coveragePost } from "@/data/coverage";
import { calendarFrom } from "@/data/election-2026";
import { EVIDENCE_LABELS, sourceKind } from "@/data/evidence";
import { campaign } from "@/data/load";
import { formatIsoDate } from "@/lib/format";

const DATE_IN_TEXT =
  /(\d{1,2}(?:st|nd|rd|th) [A-Z][a-z]+,? \d{4}|[A-Z][a-z]+ \d{1,2}(?:st|nd|rd|th),? \d{4})/;

/** Wraps each spoken date in a highlight so readers can find it. */
function highlightDates(text: string) {
  let offset = 0;
  return text.split(DATE_IN_TEXT).map((part, i) => {
    const key = `${offset}-${part.length}`;
    offset += part.length;
    return i % 2 === 1 ? (
      <mark className="bg-el-flag-gold-tint px-0.5 font-semibold" key={key}>
        {part}
      </mark>
    ) : (
      <span key={key}>{part}</span>
    );
  });
}

interface Props {
  params: Promise<{ slug: string }>;
}
export function generateStaticParams() {
  return COVERAGE.map(({ slug }) => ({ slug }));
}
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const post = coveragePost((await params).slug);
  return post ? { title: post.title, description: post.dek } : {};
}

/** One coverage post: the article, any downloads, then its sources. */
export default async function UpdatePage({ params }: Props) {
  const post = coveragePost((await params).slug);
  if (!post) notFound();
  const date = post.at.slice(0, 10);
  return (
    <>
      <PageHead deck={post.dek} eyebrow="Election 2026" title={post.title}>
        <p className="mt-4 text-base text-el-muted">
          <time className="font-semibold tabular-nums" dateTime={post.at}>
            {formatIsoDate(date)}
          </time>
        </p>
      </PageHead>
      <article className="mx-auto max-w-[1240px] px-4 pt-8 sm:px-6">
        {post.graphic === "election-timeline" && (
          <figure className="m-0 mb-8 max-w-2xl border-el-ink border-y-2 py-4">
            <div className="overflow-x-auto">
              <ElectionTimeline
                calendar={calendarFrom(campaign)}
                now={new Date()}
              />
            </div>
            <figcaption className="mt-2 text-el-muted text-sm leading-relaxed">
              Dates from the Notice of Issuance of Writs, Government Gazette No.
              47, and the Constitution, s. 53(1).
            </figcaption>
          </figure>
        )}
        {post.photo && (
          <Photo
            className="mb-8 max-w-4xl"
            id={post.photo}
            priority
            ratio="aspect-[16/9]"
            sizes="(max-width: 960px) 100vw, 896px"
          />
        )}
        <div className="max-w-prose space-y-4 text-lg leading-relaxed">
          {post.editorNote && (
            <p className="border-el-ink border-l-4 bg-el-paper-2 px-4 py-3 text-base">
              {post.editorNote}
            </p>
          )}
          {post.body.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>
        {post.keyDates && (
          <aside
            aria-labelledby="key-dates"
            className="mt-8 max-w-prose border-el-ink border-y-2 bg-el-flag-gold-tint p-5"
          >
            <h2
              className="font-semibold text-el-muted text-sm uppercase tracking-[0.07em]"
              id="key-dates"
            >
              Dates to know
            </h2>
            <dl className="mt-3 divide-y divide-el-rule">
              {post.keyDates.map((d) => (
                <div
                  className="grid gap-x-4 py-3 sm:grid-cols-[11rem_1fr]"
                  key={d.date}
                >
                  <dt className="font-bold font-serif text-xl tabular-nums">
                    <time dateTime={d.date}>{formatIsoDate(d.date)}</time>
                  </dt>
                  <dd className="text-base">
                    <span className="font-semibold">{d.label}</span>
                    {d.note && (
                      <span className="block text-el-muted">{d.note}</span>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </aside>
        )}
        {post.sections?.map((section) => (
          <section className="mt-8 max-w-prose" key={section.heading}>
            <h2 className="font-bold font-serif text-2xl">{section.heading}</h2>
            <div className="mt-3 space-y-4 text-lg leading-relaxed">
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
          </section>
        ))}
        {post.attachments && post.attachments.length > 0 && (
          <ul className="mt-6 max-w-prose space-y-3">
            {post.attachments.map((file) => (
              <li key={file.href}>
                <a
                  className="flex min-h-11 items-start gap-3 border border-el-rule-2 bg-el-flag-gold-tint p-4 hover:border-el-ink"
                  download
                  href={file.href}
                >
                  <Download
                    aria-hidden="true"
                    className="mt-0.5 size-5 shrink-0"
                  />
                  <span>
                    <span className="block font-semibold underline underline-offset-4">
                      Download: {file.label}
                    </span>
                    <span className="text-base text-el-muted">{file.size}</span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </article>
      {post.transcript && (
        <Section id="transcript" title={post.transcript.title}>
          <p className="max-w-prose text-base text-el-muted">
            {post.transcript.note}
          </p>
          <div className="mt-5 max-w-prose border-el-ink border-t-2 border-b pt-4 pb-2">
            <p className="font-semibold text-el-muted text-sm uppercase tracking-[0.07em]">
              {post.transcript.speaker}
            </p>
            <div className="mt-3 space-y-4 border-el-rule-2 border-l-4 pl-4 font-serif text-lg leading-relaxed">
              {post.transcript.paragraphs.map((paragraph) => (
                <p key={paragraph}>{highlightDates(paragraph)}</p>
              ))}
            </div>
          </div>
          <a
            className="mt-6 inline-block font-semibold text-base underline underline-offset-4"
            href={post.transcript.sourceUrl}
            rel="noopener"
            target="_blank"
          >
            {post.transcript.sourceLabel} →
          </a>
        </Section>
      )}
      {post.table && (
        <Section id="table" title="Returning offices">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] border-collapse text-left text-base">
              <caption className="mb-3 text-left text-el-muted">
                {post.table.caption}
              </caption>
              <thead>
                <tr className="border-el-ink border-b">
                  {post.table.columns.map((column) => (
                    <th
                      className="py-2 pr-4 font-semibold"
                      key={column}
                      scope="col"
                    >
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-el-rule">
                {post.table.rows.map((row) => (
                  <tr key={row.join("|")}>
                    {row.map((cell, i) =>
                      i === 0 ? (
                        <th
                          className="py-2 pr-4 align-top font-semibold"
                          key={cell}
                          scope="row"
                        >
                          {cell}
                        </th>
                      ) : (
                        <td
                          className="py-2 pr-4 align-top tabular-nums"
                          key={post.table?.columns[i]}
                        >
                          {cell}
                        </td>
                      )
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}
      <Section id="sources" title="Sources">
        <ul className="max-w-prose space-y-2 text-base leading-relaxed">
          {post.sources.map((source) => (
            <li key={"id" in source ? source.id : source.url}>
              {"id" in source ? (
                <SourceLink id={source.id} sources={campaign.sources} />
              ) : (
                <a
                  className="underline underline-offset-2"
                  href={source.url}
                  rel="noopener"
                  target="_blank"
                >
                  {EVIDENCE_LABELS[sourceKind([source.label, source.url])]}:{" "}
                  {source.label}
                </a>
              )}
            </li>
          ))}
        </ul>
        <Link
          className="mt-6 inline-block font-semibold text-base underline underline-offset-4"
          href="/2026#latest"
        >
          More election coverage →
        </Link>
      </Section>
    </>
  );
}
