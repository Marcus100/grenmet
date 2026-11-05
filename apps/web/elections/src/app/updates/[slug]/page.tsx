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

const DEFAULT_BYLINE = "Eugine Whint";

const DATE_IN_TEXT =
  /(\d{1,2}(?:st|nd|rd|th) [A-Z][a-z]+,? \d{4}|[A-Z][a-z]+ \d{1,2}(?:st|nd|rd|th),? \d{4})/u;

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
        <p className="mt-4 text-base font-semibold tracking-[0.07em] uppercase">
          By {post.byline ?? DEFAULT_BYLINE}
        </p>
        <p className="text-el-muted mt-1 text-base">
          <time className="tabular-nums" dateTime={post.at}>
            {formatIsoDate(date)}
          </time>
        </p>
      </PageHead>
      <article className="mx-auto max-w-[1240px] px-4 pt-8 sm:px-6">
        {post.graphic === "election-timeline" && (
          <figure className="border-el-ink m-0 mb-8 max-w-2xl border-y-2 py-4">
            <div className="overflow-x-auto">
              <ElectionTimeline
                calendar={calendarFrom(campaign)}
                now={new Date()}
              />
            </div>
            <figcaption className="text-el-muted mt-2 text-sm leading-relaxed">
              Dates from the Notice of Issuance of Writs, Government Gazette No.
              47, the Prime Minister’s address of 4 October (the police poll),
              and the Constitution, s. 53(1).
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
            <p className="border-el-ink bg-el-paper-2 border-l-4 px-4 py-3 text-base">
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
            className="border-el-ink bg-el-flag-gold-tint mt-8 max-w-prose border-y-2 p-5"
          >
            <h2
              className="text-el-muted text-sm font-semibold tracking-[0.07em] uppercase"
              id="key-dates"
            >
              Dates to know
            </h2>
            <dl className="divide-el-rule mt-3 divide-y">
              {post.keyDates.map((d) => (
                <div
                  className="grid gap-x-4 py-3 sm:grid-cols-[11rem_1fr]"
                  key={d.date}
                >
                  <dt className="font-serif text-xl font-bold tabular-nums">
                    <time dateTime={d.date}>{formatIsoDate(d.date)}</time>
                  </dt>
                  <dd className="text-base">
                    <span className="font-semibold">{d.label}</span>
                    {d.note && (
                      <span className="text-el-muted block">{d.note}</span>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </aside>
        )}
        {post.sections?.map((section) => (
          <section className="mt-8 max-w-prose" key={section.heading}>
            <h2 className="font-serif text-2xl font-bold">{section.heading}</h2>
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
                  className="border-el-rule-2 bg-el-flag-gold-tint hover:border-el-ink flex min-h-11 items-start gap-3 border p-4"
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
                    <span className="text-el-muted text-base">{file.size}</span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </article>
      {post.transcript && (
        <Section id="transcript" title={post.transcript.title}>
          <p className="text-el-muted max-w-prose text-base">
            {post.transcript.note}
          </p>
          <div className="border-el-ink mt-5 max-w-prose border-t-2 border-b pt-4 pb-2">
            <p className="text-el-muted text-sm font-semibold tracking-[0.07em] uppercase">
              {post.transcript.speaker}
            </p>
            <div className="border-el-rule-2 mt-3 space-y-4 border-l-4 pl-4 font-serif text-lg leading-relaxed">
              {post.transcript.paragraphs.map((paragraph) => (
                <p key={paragraph}>{highlightDates(paragraph)}</p>
              ))}
            </div>
          </div>
          <a
            className="mt-6 inline-block text-base font-semibold underline underline-offset-4"
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
              <caption className="text-el-muted mb-3 text-left">
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
              <tbody className="divide-el-rule divide-y">
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
          className="mt-6 inline-block text-base font-semibold underline underline-offset-4"
          href="/2026#latest"
        >
          More election coverage →
        </Link>
      </Section>
    </>
  );
}
