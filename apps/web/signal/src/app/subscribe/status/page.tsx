import Link from "next/link";
import { PageIntro } from "@/components/editorial";

export const metadata = { title: "Newsletter subscription" };

const RESULTS = {
  confirmed: {
    title: "You are subscribed",
    body: "Thanks for confirming. You can unsubscribe from any email we send.",
  },
  unsubscribed: {
    title: "You are unsubscribed",
    body: "We will not email you again unless you sign up again.",
  },
  invalid: {
    title: "That link is not valid",
    body: "It may have expired or already been used. You can request a new confirmation email by signing up again.",
  },
} as const;

type Result = keyof typeof RESULTS;

function isResult(value: string | undefined): value is Result {
  return value !== undefined && value in RESULTS;
}

export default async function SubscribeStatusPage({
  searchParams,
}: {
  searchParams: Promise<{ result?: string }>;
}) {
  const { result } = await searchParams;
  const copy = RESULTS[isResult(result) ? result : "invalid"];
  return (
    <article className="mx-auto max-w-3xl px-4 py-10 sm:px-8">
      <PageIntro eyebrow="Newsletter" title={copy.title}>
        <p>{copy.body}</p>
      </PageIntro>
      <Link className="font-semibold underline" href="/">
        Back to Signal
      </Link>
    </article>
  );
}
